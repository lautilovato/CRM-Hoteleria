import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { RagModule } from '../rag/rag.module';
import { ReservationModule } from '../reservation/reservation.module';

@Module({
  imports: [RagModule, ReservationModule],
  providers: [TelegramUpdate],
})
export class TelegramModule {}