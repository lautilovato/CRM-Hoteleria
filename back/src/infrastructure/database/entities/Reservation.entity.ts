import { Collection } from '@mikro-orm/core'; 
import { Entity, PrimaryKey, Property, OneToMany, ManyToOne, Enum } from '@mikro-orm/decorators/legacy';
import { v4 } from 'uuid';
import { Room } from './Room.entity';
import { CustomBaseEntity } from './CustomBase.entity';

export enum ReservationStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

@Entity({ tableName: 'reservations' })
export class Reservation extends CustomBaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @ManyToOne(() => Room)
  room!: Room;

  @Property({ type: 'varchar' })
  telegramUserId!: string;

  @Property({ type: 'date' })
  checkIn!: Date;

  @Property({ type: 'date' })
  checkOut!: Date;

  @Enum(() => ReservationStatus)
  status: ReservationStatus = ReservationStatus.PENDING_PAYMENT;

  @Property({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount!: number;
}