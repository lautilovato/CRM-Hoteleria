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
          useValue: { askQuestion: jest.fn() },
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

    expect(mockCtx.reply).toHaveBeenCalledWith('Hola, soy Chamber');
    expect(em.persist).toHaveBeenCalledTimes(2);
  });

  it('debería buscar disponibilidad y encontrar habitación (SEARCH_AVAILABILITY)', async () => {
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 }
    } as any);

    jest.spyOn(reservationService, 'searchAvailability').mockResolvedValue(
      '¡Buenas noticias! Tenemos disponibilidad en nuestra Suite del 10-10-2026 al 15-10-2026 por $100 la noche.\n\n¿Te gustaría que confirmemos la reserva?'
    );

    await update.onMessage('Quiero reservar', mockCtx);

    expect(reservationService.searchAvailability).toHaveBeenCalledWith(
      mockTelegramUserId, null, expect.objectContaining({ checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 })
    );
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('¡Buenas noticias! Tenemos disponibilidad en nuestra Suite')
    );
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
      action: ChatAction.CONFIRM_RESERVATION
    } as any);

    jest.spyOn(reservationService, 'confirmReservation').mockImplementation(async (_telegramUserId, booking) => {
      booking.step = BookingProcessStep.COMPLETED;
      return '¡Listo! Tu reserva en la Suite ha sido confirmada con éxito del 10-10-2026 al 15-10-2026. El total a abonar será de $500. ¡Te esperamos!';
    });

    await update.onMessage('Sí, confirmo', mockCtx);

    expect(activeBooking.step).toBe('COMPLETED');
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('ha sido confirmada con éxito')
    );
    expect(em.persist).toHaveBeenCalledTimes(2);
  });
});
