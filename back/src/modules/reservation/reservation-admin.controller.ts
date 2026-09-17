import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { RolesGuard } from '../auth/auth.guard';
import { UserRole } from '../../infrastructure/database/entities/User.entity';
import { ReservationAdminService } from './reservation-admin.service';
import { ListReservationsQueryDto } from './dto/listReservations.dto';
import { SaveReservationDto } from './dto/saveReservation.dto';

// Panel de administración de reservas (US-5). El guard global (JwtAuthGuard) ya exige estar
// autenticado; acá se suma que además sea Administrador, como pide el checklist de la US.
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('reservations')
export class ReservationAdminController {
  constructor(private readonly reservationAdminService: ReservationAdminService) {}

  // CA1: listado con paginación, orden y filtros por estado/fecha.
  @Get()
  list(@Query() query: ListReservationsQueryDto) {
    return this.reservationAdminService.list(query);
  }

  // CA2: alta manual, sin pasar por Telegram ni Mercado Pago.
  @Post()
  create(@Body() body: SaveReservationDto) {
    return this.reservationAdminService.create(body);
  }

  // CA3: edición, con la misma validación de disponibilidad que el alta.
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: SaveReservationDto) {
    return this.reservationAdminService.update(id, body);
  }

  // CA5: cancelación segura (soft delete), libera la habitación de inmediato.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reservationAdminService.cancel(id);
  }
}
