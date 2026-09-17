import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { RolesGuard } from '../auth/auth.guard';
import { UserRole } from '../../infrastructure/database/entities/User.entity';
import { RoomRepository } from './room.repository';
import { RoomOptionDto } from './dto/roomOption.dto';

// Lo consume el selector de habitaciones del alta/edición manual de reservas (US-5).
// El guard global ya exige estar autenticado; acá se suma que sea Administrador.
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('rooms')
export class RoomController {
  constructor(private readonly roomRepository: RoomRepository) {}

  @Get()
  async list(): Promise<RoomOptionDto[]> {
    const rooms = await this.roomRepository.findAllWithCategory();
    return rooms.map((room) => RoomOptionDto.fromEntity(room));
  }
}
