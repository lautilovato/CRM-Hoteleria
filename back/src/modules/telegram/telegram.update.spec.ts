import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { Context } from 'telegraf';
import { TelegramUpdate } from './telegram.update';
import { RagService, ChatAction } from '../rag/rag.service';
import { ReservationService } from '../reservation/reservation.service';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { BookingProcessStep } from '../../infrastructure/database/entities/BookingProcess.entity';

describe('TelegramUpdate', () => {
  let update: TelegramUpdate;
  let ragService: RagService;
  let reservationService: ReservationService;
  let bookingProcessService: BookingProcessService;
  let em: EntityManager;

  const mockTelegramUserId = '123456789';
  let mockCtx: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramUpdate,
        {
          provide: RagService,
          useValue: { askQuestion: jest.fn(), composeUnavailableReply: jest.fn() },
        },
        {
          provide: ReservationService,
          useValue: {
            searchAvailability: jest.fn(),
            confirmReservation: jest.fn(),
          },
        },
        {
          provide: BookingProcessService,
          useValue: {
            getActive: jest.fn(),
            getLastCompleted: jest.fn(),
          },
        },
        {
          provide: EntityManager,
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((entity, data) => data),
            persist: jest.fn(),
            flush: jest.fn(),
          },
        },
      ],
    }).compile();

    update = module.get<TelegramUpdate>(TelegramUpdate);
    ragService = module.get<RagService>(RagService);
    reservationService = module.get<ReservationService>(ReservationService);
    bookingProcessService = module.get<BookingProcessService>(BookingProcessService);
    em = module.get<EntityManager>(EntityManager);

    jest.spyOn(bookingProcessService, 'getActive').mockResolvedValue(null);
    jest.spyOn(bookingProcessService, 'getLastCompleted').mockResolvedValue(null);
    jest.spyOn(em, 'find').mockResolvedValue([]);

    mockCtx = {
      from: { id: mockTelegramUserId },
      sendChatAction: jest.fn(),
      reply: jest.fn(),
    };
  });

  it('debería responder un mensaje simple (REPLY)', async () => {
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: 'Hola, soy Chamber',
      action: ChatAction.REPLY,
    } as any);

    await update.onMessage('Hola', mockCtx);

    expect(mockCtx.reply).toHaveBeenCalledWith('Hola, soy Chamber', { parse_mode: 'HTML' });
    expect(em.persist).toHaveBeenCalledTimes(2);
  });

  it('debería buscar disponibilidad y encontrar habitación (SEARCH_AVAILABILITY)', async () => {
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 }
    } as any);

    jest.spyOn(reservationService, 'searchAvailability').mockResolvedValue({
      available: true,
      reply: '¡Buenas noticias! Tenemos disponibilidad en nuestra Suite del 10-10-2026 al 15-10-2026 por $100 la noche.\n\n¿Te gustaría que confirmemos la reserva?',
    });

    await update.onMessage('Quiero reservar', mockCtx);

    expect(reservationService.searchAvailability).toHaveBeenCalledWith(
      mockTelegramUserId, null, expect.objectContaining({ checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 })
    );
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('¡Buenas noticias! Tenemos disponibilidad en nuestra Suite'),
      { parse_mode: 'HTML' }
    );
  });

  describe('sin disponibilidad en las fechas pedidas (SEARCH_AVAILABILITY)', () => {
    const datos = { checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 };
    const alternatives = [
      { checkIn: '12-10-2026', checkOut: '17-10-2026', nights: 5, isShorterStay: false, roomCategory: 'Suite <VIP>', totalAmount: 500 },
    ];

    beforeEach(() => {
      jest.spyOn(ragService, 'askQuestion').mockResolvedValue({ texto: '', action: ChatAction.SEARCH_AVAILABILITY, datos } as any);
    });

    it('le pide a Gemini una respuesta empática con las alternativas y la escapa como HTML', async () => {
      jest.spyOn(reservationService, 'searchAvailability').mockResolvedValue({ available: false, alternatives });
      jest.spyOn(ragService, 'composeUnavailableReply').mockResolvedValue('Qué pena! Tengo la Suite <VIP> del 12 al 17');

      await update.onMessage('Quiero del 10 al 15', mockCtx);

      expect(ragService.composeUnavailableReply).toHaveBeenCalledWith(
        'Quiero del 10 al 15', [], expect.objectContaining(datos), alternatives,
      );
      expect(mockCtx.reply).toHaveBeenCalledWith('Qué pena! Tengo la Suite &lt;VIP&gt; del 12 al 17', { parse_mode: 'HTML' });
    });

    it('lista las alternativas tal cual si Gemini no devuelve texto', async () => {
      jest.spyOn(reservationService, 'searchAvailability').mockResolvedValue({ available: false, alternatives });
      jest.spyOn(ragService, 'composeUnavailableReply').mockResolvedValue('');

      await update.onMessage('Quiero del 10 al 15', mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('• Del 12-10-2026 al 17-10-2026 (5 noches) – Suite &lt;VIP&gt;, total $500'),
        { parse_mode: 'HTML' },
      );
    });

    it('responde con el mensaje fijo, sin llamar a Gemini, si tampoco hay fechas cercanas', async () => {
      jest.spyOn(reservationService, 'searchAvailability').mockResolvedValue({ available: false, alternatives: [] });

      await update.onMessage('Quiero del 10 al 15', mockCtx);

      expect(ragService.composeUnavailableReply).not.toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Lamentablemente no nos quedan habitaciones para 2 personas en esas fechas ni en los 7 días cercanos. ¿Probamos con otras fechas?',
        { parse_mode: 'HTML' },
      );
    });
  });

  it('debería responder con error técnico si los datos de SEARCH_AVAILABILITY son inválidos', async () => {
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: 'no-es-una-fecha', checkOut: '15-10-2026', capacity: 2 }
    } as any);

    await update.onMessage('Quiero reservar', mockCtx);

    expect(reservationService.searchAvailability).not.toHaveBeenCalled();
    expect(mockCtx.reply).toHaveBeenCalledWith(
      'Hubo un error técnico al procesar tu consulta. Por favor, intentá nuevamente.'
    );
  });

  it('debería confirmar una reserva si hay un proceso pendiente (CONFIRM_RESERVATION)', async () => {
    const activeBooking: any = {
      telegramUserId: mockTelegramUserId,
      step: 'PENDING_CONFIRMATION',
      checkIn: '10-10-2026',
      checkOut: '15-10-2026',
      capacity: 2
    };

    jest.spyOn(bookingProcessService, 'getActive').mockResolvedValue(activeBooking);
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.CONFIRM_RESERVATION,
      datos: { fullName: 'Juan Pérez', dni: '30111222' }
    } as any);

    jest.spyOn(reservationService, 'confirmReservation').mockImplementation(async (_telegramUserId, booking) => {
      booking.step = BookingProcessStep.COMPLETED;
      return 'Te estoy guardando la Suite del 10-10-2026 al 15-10-2026. Todavía no está confirmada.';
    });

    await update.onMessage('Sí, confirmo', mockCtx);

    expect(activeBooking.step).toBe('COMPLETED');
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Todavía no está confirmada'),
      { parse_mode: 'HTML' }
    );
    expect(em.persist).toHaveBeenCalledTimes(2);
  });

  it('debería pedir los datos del huésped en vez de cortar con un error si faltan al confirmar (CONFIRM_RESERVATION)', async () => {
    const activeBooking: any = {
      telegramUserId: mockTelegramUserId,
      step: 'PENDING_CONFIRMATION',
      checkIn: '10-10-2026',
      checkOut: '15-10-2026',
      capacity: 2
    };

    jest.spyOn(bookingProcessService, 'getActive').mockResolvedValue(activeBooking);
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.CONFIRM_RESERVATION,
      datos: { fullName: '', dni: 'no-es-un-dni' }
    } as any);

    await update.onMessage('Sí, confirmo', mockCtx);

    expect(reservationService.confirmReservation).not.toHaveBeenCalled();
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('necesito el nombre completo y el DNI'),
      { parse_mode: 'HTML' }
    );
  });

  it('debería pedir solo el DNI si el nombre vino bien pero el DNI no (CONFIRM_RESERVATION)', async () => {
    const activeBooking: any = {
      telegramUserId: mockTelegramUserId,
      step: 'PENDING_CONFIRMATION',
      checkIn: '10-10-2026',
      checkOut: '15-10-2026',
      capacity: 2
    };

    jest.spyOn(bookingProcessService, 'getActive').mockResolvedValue(activeBooking);
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.CONFIRM_RESERVATION,
      datos: { fullName: 'Juan Pérez', dni: '30.111.222' }
    } as any);

    await update.onMessage('Sí, confirmo', mockCtx);

    expect(reservationService.confirmReservation).not.toHaveBeenCalled();
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('DNI del huésped'),
      { parse_mode: 'HTML' }
    );
  });

  it('no repite la oferta si el usuario la acepta y el modelo vuelve a buscar los mismos datos (SEARCH_AVAILABILITY)', async () => {
    const activeBooking: any = {
      telegramUserId: mockTelegramUserId,
      step: 'PENDING_CONFIRMATION',
      checkIn: '10-10-2026',
      checkOut: '15-10-2026',
      capacity: 2
    };

    jest.spyOn(bookingProcessService, 'getActive').mockResolvedValue(activeBooking);
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 }
    } as any);

    await update.onMessage('dale', mockCtx);

    expect(reservationService.searchAvailability).not.toHaveBeenCalled();
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('necesito el nombre completo y el DNI'),
      { parse_mode: 'HTML' }
    );
  });

  it('sí vuelve a buscar disponibilidad si el usuario cambia las fechas (SEARCH_AVAILABILITY)', async () => {
    const activeBooking: any = {
      telegramUserId: mockTelegramUserId,
      step: 'PENDING_CONFIRMATION',
      checkIn: '10-10-2026',
      checkOut: '15-10-2026',
      capacity: 2
    };

    jest.spyOn(bookingProcessService, 'getActive').mockResolvedValue(activeBooking);
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: '20-10-2026', checkOut: '25-10-2026', capacity: 2 }
    } as any);
    jest.spyOn(reservationService, 'searchAvailability').mockResolvedValue({ available: true, reply: 'Tenemos disponibilidad en nuestra Suite del 20-10-2026 al 25-10-2026.' });

    await update.onMessage('mejor del 20 al 25', mockCtx);

    expect(reservationService.searchAvailability).toHaveBeenCalledWith(
      mockTelegramUserId, activeBooking, expect.objectContaining({ checkIn: '20-10-2026', checkOut: '25-10-2026' })
    );
  });
});
