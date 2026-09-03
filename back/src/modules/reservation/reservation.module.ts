import { Module } from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { RoomSeederService } from './room.seeder.service';
import { BookingProcessRepository } from './booking-process.repository';
import { RoomRepository } from './room.repository';
import { ReservationRepository } from './reservation.repository';

@Module({
  providers: [
    ReservationService,
    RoomSeederService,
    BookingProcessRepository,
    RoomRepository,
    ReservationRepository,
  ],
  exports: [ReservationService],
})
export class ReservationModule {}
