import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Reservation, ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';
import { Room } from '../../infrastructure/database/entities/Room.entity';

interface CreateReservationData {
  room: Room;
  telegramUserId: string;
  checkIn: Date;
  checkOut: Date;
  totalAmount: number;
  depositAmount: number;
}

@Injectable()
export class ReservationRepository {
  constructor(private readonly em: EntityManager) {}

  async findOverlapping(checkIn: Date, checkOut: Date): Promise<Reservation[]> {
    return this.em.find(Reservation, {
      $and: [{ checkIn: { $lt: checkOut } }, { checkOut: { $gt: checkIn } }],
    }, { populate: ['room'] });
  }

  create(data: CreateReservationData): Reservation {
    return this.em.create(Reservation, { ...data, status: ReservationStatus.PENDING_PAYMENT });
  }

  persist(reservation: Reservation): void {
    this.em.persist(reservation);
  }
}
