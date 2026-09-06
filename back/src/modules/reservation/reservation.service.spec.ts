import { Test, TestingModule } from '@nestjs/testing';
import { ReservationService } from './reservation.service';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { RoomRepository } from '../room/room.repository';
import { ReservationRepository } from './reservation.repository';
import { PaymentService } from '../payment/payment.service';
import { BookingProcessStep } from '../../infrastructure/database/entities/BookingProcess.entity';

describe('ReservationService', () => {
  let service: ReservationService;
  let bookingProcessService: BookingProcessService;
  let roomRepository: RoomRepository;
  let reservationRepository: ReservationRepository;
  let paymentService: PaymentService;

  const mockTelegramUserId = '123456789';
  const mockGuestData = { fullName: 'Juan Pérez', dni: '30111222' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationService,
        {
          provide: BookingProcessService,
          useValue: {
            startSearch: jest.fn().mockImplementation((telegramUserId, activeBooking, dto) =>
              activeBooking || { telegramUserId, checkIn: dto.checkIn, checkOut: dto.checkOut, capacity: dto.capacity, step: BookingProcessStep.IN_PROGRESS }
            ),
            markPendingConfirmation: jest.fn(),
            markInProgress: jest.fn(),
            markCompleted: jest.fn(),
          },
        },
        {
          provide: RoomRepository,
          useValue: {
            findByCapacityExcluding: jest.fn(),
          },
        },
        {
          provide: ReservationRepository,
          useValue: {
            findOverlapping: jest.fn(),
            create: jest.fn().mockImplementation((data) => data),
            persist: jest.fn(),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            createPreference: jest.fn().mockResolvedValue({ preferenceId: 'pref-1', initPoint: 'https://mp.example/pref-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<ReservationService>(ReservationService);
    bookingProcessService = module.get<BookingProcessService>(BookingProcessService);
    roomRepository = module.get<RoomRepository>(RoomRepository);
    reservationRepository = module.get<ReservationRepository>(ReservationRepository);
    paymentService = module.get<PaymentService>(PaymentService);
  });

  describe('searchAvailability', () => {
    it('devuelve la oferta de la habitación cuando hay disponibilidad', async () => {
      const mockRoom = { id: 'room-1', category: { name: 'Suite', basePrice: 100 } };

      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([mockRoom as any]);

      const botReply = await service.searchAvailability(
        mockTelegramUserId, null, { checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 }
      );

      expect(botReply).toContain('Tenemos disponibilidad en nuestra Suite del 10-10-2026 al 15-10-2026 por $100 la noche.');
      expect(botReply).toContain('El total de tu estadía (5 noches) sería de $500');
      expect(botReply).toContain('seña del 30% de $150');
      expect(roomRepository.findByCapacityExcluding).toHaveBeenCalledWith(2, []);
      expect(bookingProcessService.markPendingConfirmation).toHaveBeenCalled();
      expect(bookingProcessService.markInProgress).not.toHaveBeenCalled();
    });

    it('devuelve el mensaje de "sin disponibilidad" cuando no hay habitaciones libres', async () => {
      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([]);

      const botReply = await service.searchAvailability(
        mockTelegramUserId, null, { checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 }
      );

      expect(botReply).toBe('Lamentablemente no nos quedan habitaciones para 2 personas en esas fechas. ¿Buscamos otras fechas?');
      expect(bookingProcessService.markInProgress).toHaveBeenCalled();
      expect(bookingProcessService.markPendingConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('confirmReservation', () => {
    const activeBooking: any = {
      telegramUserId: mockTelegramUserId,
      step: BookingProcessStep.PENDING_CONFIRMATION,
      checkIn: '10-10-2026',
      checkOut: '15-10-2026',
      capacity: 2,
    };

    it('crea la reserva y calcula el total cuando la habitación sigue disponible', async () => {
      const mockRoom = { id: 'room-1', category: { name: 'Suite', basePrice: 100 } };

      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([mockRoom as any]);

      const booking = { ...activeBooking };
      const botReply = await service.confirmReservation(mockTelegramUserId, booking, mockGuestData);

      expect(botReply).toContain('ha sido confirmada con éxito del 10-10-2026 al 15-10-2026');
      expect(botReply).toContain('El total de la estadía es de $500');
      expect(botReply).toContain('la seña a abonar para confirmarla es de $150');
      expect(botReply).toContain('https://mp.example/pref-1');
      expect(reservationRepository.persist).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 500,
          depositAmount: 150,
          room: mockRoom,
          guestFullName: 'Juan Pérez',
          guestDni: '30111222',
        })
      );
      expect(paymentService.createPreference).toHaveBeenCalledWith(
        expect.objectContaining({ guestFullName: 'Juan Pérez', guestDni: '30111222' }),
        mockGuestData,
      );
      expect(bookingProcessService.markCompleted).toHaveBeenCalledWith(booking);
    });

    it('propaga el error si Mercado Pago falla al crear la preferencia (no queda reserva a medio confirmar)', async () => {
      const mockRoom = { id: 'room-1', category: { name: 'Suite', basePrice: 100 } };

      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([mockRoom as any]);
      jest.spyOn(paymentService, 'createPreference').mockRejectedValue(new Error('Mercado Pago no responde'));

      const booking = { ...activeBooking };

      await expect(service.confirmReservation(mockTelegramUserId, booking, mockGuestData)).rejects.toThrow(
        'Mercado Pago no responde',
      );
    });

    it('marca el booking como IN_PROGRESS si la habitación se ocupó mientras tanto', async () => {
      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([]);
      const booking = { ...activeBooking };

      const botReply = await service.confirmReservation(mockTelegramUserId, booking, mockGuestData);

      expect(botReply).toContain('alguien acaba de reservar la última habitación disponible');
      expect(bookingProcessService.markInProgress).toHaveBeenCalledWith(booking);
      expect(reservationRepository.persist).not.toHaveBeenCalled();
      expect(paymentService.createPreference).not.toHaveBeenCalled();
    });
  });
});
