import { Test, TestingModule } from '@nestjs/testing';
import { ReservationService } from './reservation.service';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { RoomRepository } from '../room/room.repository';
import { ReservationRepository } from './reservation.repository';
import { BookingProcessStep } from '../../infrastructure/database/entities/BookingProcess.entity';

describe('ReservationService', () => {
  let service: ReservationService;
  let bookingProcessService: BookingProcessService;
  let roomRepository: RoomRepository;
  let reservationRepository: ReservationRepository;

  const mockTelegramUserId = '123456789';

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
      ],
    }).compile();

    service = module.get<ReservationService>(ReservationService);
    bookingProcessService = module.get<BookingProcessService>(BookingProcessService);
    roomRepository = module.get<RoomRepository>(RoomRepository);
    reservationRepository = module.get<ReservationRepository>(ReservationRepository);
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
      const botReply = await service.confirmReservation(mockTelegramUserId, booking);

      expect(botReply).toContain('ha sido confirmada con éxito del 10-10-2026 al 15-10-2026');
      expect(botReply).toContain('El total de la estadía es de $500');
      expect(botReply).toContain('la seña a abonar para confirmarla es de $150');
      expect(reservationRepository.persist).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 500, depositAmount: 150, room: mockRoom })
      );
      expect(bookingProcessService.markCompleted).toHaveBeenCalledWith(booking);
    });

    it('marca el booking como IN_PROGRESS si la habitación se ocupó mientras tanto', async () => {
      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([]);
      const booking = { ...activeBooking };

      const botReply = await service.confirmReservation(mockTelegramUserId, booking);

      expect(botReply).toContain('alguien acaba de reservar la última habitación disponible');
      expect(bookingProcessService.markInProgress).toHaveBeenCalledWith(booking);
      expect(reservationRepository.persist).not.toHaveBeenCalled();
    });
  });
});
