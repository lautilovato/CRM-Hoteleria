import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { ReservationRepository } from './reservation.repository';
import { Reservation, ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';

describe('ReservationRepository', () => {
  let repository: ReservationRepository;
  let em: EntityManager;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationRepository,
        {
          provide: EntityManager,
          useValue: {
            find: jest.fn(),
            create: jest.fn().mockImplementation((_entity, data) => data),
            persist: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<ReservationRepository>(ReservationRepository);
    em = module.get<EntityManager>(EntityManager);
  });

  it('findOverlapping busca reservas que se solapen con el rango de fechas', async () => {
    const checkIn = new Date(2026, 9, 10);
    const checkOut = new Date(2026, 9, 15);

    await repository.findOverlapping(checkIn, checkOut);

    expect(em.find).toHaveBeenCalledWith(
      Reservation,
      { $and: [{ checkIn: { $lt: checkOut } }, { checkOut: { $gt: checkIn } }] },
      { populate: ['room'] },
    );
  });

  it('create arma la reserva con estado PENDING_PAYMENT', () => {
    const data: any = {
      room: { id: 'room-1' },
      telegramUserId: '123456789',
      checkIn: new Date(2026, 9, 10),
      checkOut: new Date(2026, 9, 15),
      totalAmount: 500,
      depositAmount: 150,
    };

    const reservation = repository.create(data);

    expect(em.create).toHaveBeenCalledWith(Reservation, { ...data, status: ReservationStatus.PENDING_PAYMENT });
    expect(reservation).toMatchObject({ status: ReservationStatus.PENDING_PAYMENT });
  });

  it('persist delega en el EntityManager', () => {
    const reservation: any = { id: 'reservation-1' };

    repository.persist(reservation);

    expect(em.persist).toHaveBeenCalledWith(reservation);
  });
});
