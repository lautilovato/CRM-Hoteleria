import { Controller, Get } from '@nestjs/common';
import { RoomRepository } from './room.repository';
import { RoomOptionDto } from './dto/roomOption.dto';

// Lo consume el selector de habitaciones del alta/edición manual de reservas (US-5).
// Solo lo protege el guard global: cualquier usuario autenticado puede listarlas.
@Controller('rooms')
export class RoomController {
  constructor(private readonly roomRepository: RoomRepository) {}

  @Get()
  async list(): Promise<RoomOptionDto[]> {
    const rooms = await this.roomRepository.findAllWithCategory();
    return rooms.map((room) => RoomOptionDto.fromEntity(room));
  }
}
