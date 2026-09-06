import { Module } from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { ReservationRepository } from './reservation.repository';
import { BookingProcessModule } from '../bookingProcess/bookingProcess.module';
import { RoomModule } from '../room/room.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [BookingProcessModule, RoomModule, PaymentModule],
  providers: [ReservationService, ReservationRepository],
  exports: [ReservationService],
})
export class ReservationModule {}
