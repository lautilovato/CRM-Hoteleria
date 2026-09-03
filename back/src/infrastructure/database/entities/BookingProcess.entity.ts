import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { v4 } from 'uuid';
import { CustomBaseEntity } from './CustomBase.entity';

@Entity({ tableName: 'booking_processes' })
export class BookingProcess extends CustomBaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @Property({ type: 'varchar' })
  telegramUserId!: string;

  @Property({ type: 'varchar', default: 'AWAITING_CHECKIN' })
  step: string = 'AWAITING_CHECKIN'; 

  @Property({ type: 'varchar', nullable: true })
  checkIn?: string;

  @Property({ type: 'varchar', nullable: true })
  checkOut?: string;

  @Property({ type: 'integer', nullable: true })
  capacity?: number;
}