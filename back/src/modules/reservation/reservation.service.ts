import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';
import { Room } from '../../infrastructure/database/entities/Room.entity';
import { Reservation, ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';
import { SearchAvailabilityDto } from './dto/search-availability.dto';

@Injectable()
export class ReservationService {
  constructor(private readonly em: EntityManager) {}

  async getActiveBooking(telegramUserId: string): Promise<BookingProcess | null> {
    return this.em.findOne(BookingProcess, {
      telegramUserId,
      step: { $in: ['IN_PROGRESS', 'PENDING_CONFIRMATION'] },
    });
  }

  async getLastCompletedBooking(telegramUserId: string): Promise<BookingProcess | null> {
    return this.em.findOne(
      BookingProcess, { telegramUserId, step: 'COMPLETED' }, { orderBy: { createdAt: 'DESC' } }
    );
  }

  async searchAvailability(
    telegramUserId: string,
    activeBooking: BookingProcess | null,
    { checkIn, checkOut, capacidad }: SearchAvailabilityDto,
  ): Promise<string> {
    let booking = activeBooking || this.em.create(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });
    booking.checkIn = checkIn;
    booking.checkOut = checkOut;
    booking.roomType = capacidad.toString();

    const roomFound = await this.findAvailableRoom(checkIn, checkOut, capacidad);

    let botReply: string;
    if (roomFound) {
      booking.step = 'PENDING_CONFIRMATION';

      botReply = `¡Buenas noticias! Tenemos disponibilidad en nuestra ${roomFound.category.name} del ${checkIn} al ${checkOut} por $${roomFound.category.basePrice} la noche.\n\n¿Te gustaría que confirmemos la reserva?`;
    } else {
      booking.step = 'IN_PROGRESS';
      botReply = `Lamentablemente no nos quedan habitaciones para ${capacidad} personas en esas fechas. ¿Buscamos otras fechas?`;
    }
    this.em.persist(booking);

    return botReply;
  }

  async confirmReservation(telegramUserId: string, activeBooking: BookingProcess): Promise<string> {
    const savedCheckIn = activeBooking.checkIn as string;
    const savedCheckOut = activeBooking.checkOut as string;
    const capacidad = parseInt(activeBooking.roomType as string);

    const roomToBook = await this.findAvailableRoom(savedCheckIn, savedCheckOut, capacidad);

    let botReply: string;
    if (roomToBook) {
      const checkInDate = new Date(savedCheckIn);
      const checkOutDate = new Date(savedCheckOut);
      const nights = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 3600 * 24);
      const totalAmount = roomToBook.category.basePrice * nights;

      const newReservation = this.em.create(Reservation, {
        room: roomToBook,
        telegramUserId,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        totalAmount: totalAmount,
        status: ReservationStatus.PENDING_PAYMENT,
      });

      this.em.persist(newReservation);
      activeBooking.step = 'COMPLETED';

      botReply = `¡Listo! Tu reserva en la ${roomToBook.category.name} ha sido confirmada con éxito del ${savedCheckIn} al ${savedCheckOut}. El total a abonar será de $${totalAmount}. ¡Te esperamos!`;
    } else {
      botReply = `Uy, parece que alguien acaba de reservar la última habitación disponible para esas fechas mientras hablábamos. ¿Te gustaría buscar otra fecha?`;
      activeBooking.step = 'IN_PROGRESS';
    }

    return botReply;
  }

  private async findAvailableRoom(checkIn: string | Date, checkOut: string | Date, capacidad: number): Promise<Room | null> {
    const overlappingReservations = await this.em.find(Reservation, {
      $and: [{ checkIn: { $lt: new Date(checkOut) } }, { checkOut: { $gt: new Date(checkIn) } }],
    }, { populate: ['room'] });

    const reservedRoomIds = overlappingReservations.map(r => r.room.id);

    const availableRooms = await this.em.find(Room, {
      category: { capacity: { $gte: capacidad } },
      ...(reservedRoomIds.length > 0 ? { id: { $nin: reservedRoomIds } } : {}),
    }, { populate: ['category'] });

    return availableRooms.length > 0 ? availableRooms[0] : null;
  }
}
