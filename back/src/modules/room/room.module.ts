import { Module } from '@nestjs/common';
import { RoomRepository } from './room.repository';
import { RoomSeederService } from './room.seeder.service';

@Module({
  providers: [RoomRepository, RoomSeederService],
  exports: [RoomRepository],
})
export class RoomModule {}
