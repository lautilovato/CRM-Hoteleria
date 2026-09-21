import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RoomService } from './room.service';
import { RoomOptionDto } from './dto/roomOption.dto';
import { CreateRoomDto } from './dto/createRoom.dto';
import { UpdateRoomDto } from './dto/updateRoom.dto';
import { RolesGuard } from '../auth/auth.guard';
import { Roles } from '../auth/auth.decorators';
import { UserRole } from '../../infrastructure/database/entities/User.entity';

// US-6: gestión del inventario de habitaciones.
// El guard global (JwtAuthGuard) ya exige estar autenticado para todo el controller.
// El listado queda abierto a cualquier usuario autenticado (lo sigue usando el selector de
// habitaciones del alta/edición manual de reservas de US-5, que puede usar ADMIN o EMPLOYEE);
// las mutaciones (alta, edición, baja) quedan reservadas al rol ADMIN.
@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  // CA1: inventario completo con precios, capacidades y estados actuales.
  @Get()
  list(): Promise<RoomOptionDto[]> {
    return this.roomService.list();
  }

  // CA2: rechaza números de habitación duplicados.
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post()
  create(@Body() body: CreateRoomDto): Promise<RoomOptionDto> {
    return this.roomService.create(body);
  }

  // CA2, CA4: edición, incluye cambio de precio base/estado con reflejo inmediato en el bot.
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateRoomDto): Promise<RoomOptionDto> {
    return this.roomService.update(id, body);
  }

  // CA3: baja segura (soft delete), nunca borra el registro físico.
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.roomService.remove(id);
  }
}
