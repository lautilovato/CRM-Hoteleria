import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { PaymentRepository } from './payment.repository';
import { Reservation, ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';

describe('PaymentRepository', () => {
  let repository: PaymentRepository;
  let em: EntityManager;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRepository,
        {
          provide: EntityManager,
          useValue: {
            findOne: jest.fn(),
            persist: jest.fn(),
            flush: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<PaymentRepository>(PaymentRepository);
    em = module.get<EntityManager>(EntityManager);
  });

  it('findReservationById busca la reserva por id populando la habitación y su categoría', async () => {
    await repository.findReservationById('reservation-1');

    expect(em.findOne).toHaveBeenCalledWith(
      Reservation,
      { id: 'reservation-1' },
      { populate: ['room', 'room.category'] },
    );
  });

  it('markConfirmed marca la reserva como CONFIRMED y guarda el id de pago', async () => {
    const reservation: any = { id: 'reservation-1', status: ReservationStatus.PENDING_PAYMENT };

    await repository.markConfirmed(reservation, '999');

    expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
    expect(reservation.mpPaymentId).toBe('999');
    expect(em.persist).toHaveBeenCalledWith(reservation);
    expect(em.flush).toHaveBeenCalled();
  });
});
