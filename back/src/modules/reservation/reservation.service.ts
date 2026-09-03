import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';
import { Room } from '../../infrastructure/database/entities/Room.entity';
import { Reservation, ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';
import { SearchAvailabilityDto } from './dto/search-availability.dto';

const DEPOSIT_PERCENTAGE = 0.3;

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
    { checkIn, checkOut, capacity }: SearchAvailabilityDto,
  ): Promise<string> {
    let booking = activeBooking || this.em.create(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });
    booking.checkIn = checkIn;
    booking.checkOut = checkOut;
    booking.capacity = capacity;

    const roomFound = await this.findAvailableRoom(checkIn, checkOut, capacity);

    let botReply: string;
    if (roomFound) {
      booking.step = 'PENDING_CONFIRMATION';

      const nights = this.calculateNights(checkIn, checkOut);
      const totalAmount = roomFound.category.basePrice * nights;
      const depositAmount = totalAmount * DEPOSIT_PERCENTAGE;

      botReply = `Tenemos disponibilidad en nuestra ${roomFound.category.name} del ${checkIn} al ${checkOut} por $${roomFound.category.basePrice} la noche.\n\nEl total de tu estadía (${nights} noches) sería de $${totalAmount}, con una seña del 30% de $${depositAmount} para confirmar la reserva.\n\n¿Te gustaría que confirmemos la reserva?`;
    } else {
      booking.step = 'IN_PROGRESS';
      botReply = `Lamentablemente no nos quedan habitaciones para ${capacity} personas en esas fechas. ¿Buscamos otras fechas?`;
    }
    this.em.persist(booking);

    return botReply;
  }

  async confirmReservation(telegramUserId: string, activeBooking: BookingProcess): Promise<string> {
    const savedCheckIn = activeBooking.checkIn as string;
    const savedCheckOut = activeBooking.checkOut as string;
    const capacity = activeBooking.capacity as number;

    const roomToBook = await this.findAvailableRoom(savedCheckIn, savedCheckOut, capacity);

    let botReply: string;
    if (roomToBook) {
      const checkInDate = new Date(savedCheckIn);
      const checkOutDate = new Date(savedCheckOut);
      const nights = this.calculateNights(savedCheckIn, savedCheckOut);
      const totalAmount = roomToBook.category.basePrice * nights;
      const depositAmount = totalAmount * DEPOSIT_PERCENTAGE;

      const newReservation = this.em.create(Reservation, {
        room: roomToBook,
        telegramUserId,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        totalAmount: totalAmount,
        depositAmount: depositAmount,
        status: ReservationStatus.PENDING_PAYMENT,
      });

      this.em.persist(newReservation);
      activeBooking.step = 'COMPLETED';

      botReply = `¡Listo! Tu reserva en la ${roomToBook.category.name} ha sido confirmada con éxito del ${savedCheckIn} al ${savedCheckOut}. El total de la estadía es de $${totalAmount}, y la seña a abonar para confirmarla es de $${depositAmount}. ¡Te esperamos!`;
    } else {
      botReply = `Uy, parece que alguien acaba de reservar la última habitación disponible para esas fechas mientras hablábamos. ¿Te gustaría buscar otra fecha?`;
      activeBooking.step = 'IN_PROGRESS';
    }

    return botReply;
  }

  private calculateNights(checkIn: string | Date, checkOut: string | Date): number {
    return (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 3600 * 24);
  }

  private async findAvailableRoom(checkIn: string | Date, checkOut: string | Date, capacity: number): Promise<Room | null> {
    const overlappingReservations = await this.em.find(Reservation, {
      $and: [{ checkIn: { $lt: new Date(checkOut) } }, { checkOut: { $gt: new Date(checkIn) } }],
    }, { populate: ['room'] });

    const reservedRoomIds = overlappingReservations.map(r => r.room.id);

    const availableRooms = await this.em.find(Room, {
      category: { capacity: { $gte: capacity } },
      ...(reservedRoomIds.length > 0 ? { id: { $nin: reservedRoomIds } } : {}),
    }, { populate: ['category'] });

    return availableRooms.length > 0 ? availableRooms[0] : null;
  }
}
