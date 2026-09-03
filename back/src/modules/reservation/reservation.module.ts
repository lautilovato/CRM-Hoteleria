import { Module } from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { RoomSeederService } from './room.seeder.service';

@Module({
  providers: [ReservationService, RoomSeederService],
  exports: [ReservationService],
})
export class ReservationModule {}
