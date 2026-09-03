import { Test, TestingModule } from '@nestjs/testing';
import { ReservationService } from './reservation.service';
import { BookingProcessRepository } from './booking-process.repository';
import { RoomRepository } from './room.repository';
import { ReservationRepository } from './reservation.repository';

describe('ReservationService', () => {
  let service: ReservationService;
  let bookingProcessRepository: BookingProcessRepository;
  let roomRepository: RoomRepository;
  let reservationRepository: ReservationRepository;

  const mockTelegramUserId = '123456789';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationService,
        {
          provide: BookingProcessRepository,
          useValue: {
            findActive: jest.fn(),
            findLastCompleted: jest.fn(),
            create: jest.fn().mockImplementation((telegramUserId: string) => ({ telegramUserId, step: 'IN_PROGRESS' })),
            persist: jest.fn(),
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
    bookingProcessRepository = module.get<BookingProcessRepository>(BookingProcessRepository);
    roomRepository = module.get<RoomRepository>(RoomRepository);
    reservationRepository = module.get<ReservationRepository>(ReservationRepository);
  });

  describe('searchAvailability', () => {
    it('devuelve la oferta de la habitación cuando hay disponibilidad', async () => {
      const mockRoom = { id: 'room-1', category: { name: 'Suite', basePrice: 100 } };

      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([mockRoom as any]);

      const botReply = await service.searchAvailability(
        mockTelegramUserId, null, { checkIn: '2026-10-10', checkOut: '2026-10-15', capacity: 2 }
      );

      expect(botReply).toContain('Tenemos disponibilidad en nuestra Suite del 2026-10-10 al 2026-10-15 por $100 la noche.');
      expect(botReply).toContain('El total de tu estadía (5 noches) sería de $500');
      expect(botReply).toContain('seña del 30% de $150');
      expect(roomRepository.findByCapacityExcluding).toHaveBeenCalledWith(2, []);
      expect(bookingProcessRepository.persist).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'PENDING_CONFIRMATION', checkIn: '2026-10-10', checkOut: '2026-10-15', capacity: 2 })
      );
    });

    it('devuelve el mensaje de "sin disponibilidad" cuando no hay habitaciones libres', async () => {
      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([]);

      const botReply = await service.searchAvailability(
        mockTelegramUserId, null, { checkIn: '2026-10-10', checkOut: '2026-10-15', capacity: 2 }
      );

      expect(botReply).toBe('Lamentablemente no nos quedan habitaciones para 2 personas en esas fechas. ¿Buscamos otras fechas?');
      expect(bookingProcessRepository.persist).toHaveBeenCalledWith(expect.objectContaining({ step: 'IN_PROGRESS' }));
    });
  });

  describe('confirmReservation', () => {
    const activeBooking: any = {
      telegramUserId: mockTelegramUserId,
      step: 'PENDING_CONFIRMATION',
      checkIn: '2026-10-10',
      checkOut: '2026-10-15',
      capacity: 2,
    };

    it('crea la reserva y calcula el total cuando la habitación sigue disponible', async () => {
      const mockRoom = { id: 'room-1', category: { name: 'Suite', basePrice: 100 } };

      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([mockRoom as any]);

      const botReply = await service.confirmReservation(mockTelegramUserId, { ...activeBooking });

      expect(botReply).toContain('ha sido confirmada con éxito del 2026-10-10 al 2026-10-15');
      expect(botReply).toContain('El total de la estadía es de $500');
      expect(botReply).toContain('la seña a abonar para confirmarla es de $150');
      expect(reservationRepository.persist).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 500, depositAmount: 150, room: mockRoom })
      );
    });

    it('marca el booking como IN_PROGRESS si la habitación se ocupó mientras tanto', async () => {
      jest.spyOn(reservationRepository, 'findOverlapping').mockResolvedValue([]);
      jest.spyOn(roomRepository, 'findByCapacityExcluding').mockResolvedValue([]);
      const booking = { ...activeBooking };

      const botReply = await service.confirmReservation(mockTelegramUserId, booking);

      expect(botReply).toContain('alguien acaba de reservar la última habitación disponible');
      expect(booking.step).toBe('IN_PROGRESS');
      expect(reservationRepository.persist).not.toHaveBeenCalled();
    });
  });
});
