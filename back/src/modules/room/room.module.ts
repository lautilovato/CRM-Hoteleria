import { Module } from '@nestjs/common';
import { RoomController } from './room.controller';
import { RoomRepository } from './room.repository';
import { RoomSeederService } from './room.seeder.service';

@Module({
  controllers: [RoomController],
  providers: [RoomRepository, RoomSeederService],
  exports: [RoomRepository],
})
export class RoomModule {}