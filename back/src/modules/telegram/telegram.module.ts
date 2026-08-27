import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [RagModule], 
  providers: [TelegramUpdate],
})
export class TelegramModule {}