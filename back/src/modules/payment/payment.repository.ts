import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Reservation, ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';

@Injectable()
export class PaymentRepository {
  constructor(private readonly em: EntityManager) {}

  async findReservationById(id: string): Promise<Reservation | null> {
    return this.em.findOne(Reservation, { id }, { populate: ['room', 'room.category'] });
  }

  async markConfirmed(reservation: Reservation, mpPaymentId: string): Promise<void> {
    reservation.status = ReservationStatus.CONFIRMED;
    reservation.mpPaymentId = mpPaymentId;
    this.em.persist(reservation);
    await this.em.flush();
  }
}
