import { Injectable } from '@nestjs/common';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';
import { Room } from '../../infrastructure/database/entities/Room.entity';
import { SearchAvailabilityDto } from '../bookingProcess/dto/searchAvailability.dto';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { RoomRepository } from '../room/room.repository';
import { ReservationRepository } from './reservation.repository';
import { parseDate } from '../bookingProcess/date.util';
import { PaymentService } from '../payment/payment.service';
import { ConfirmReservationDto } from './dto/confirmReservation.dto';

const DEPOSIT_PERCENTAGE = 0.3;

@Injectable()
export class ReservationService {
  constructor(
    private readonly bookingProcessService: BookingProcessService,
    private readonly roomRepository: RoomRepository,
    private readonly reservationRepository: ReservationRepository,
    private readonly paymentService: PaymentService,
  ) {}

  async searchAvailability(
    telegramUserId: string,
    activeBooking: BookingProcess | null,
    bookingData: SearchAvailabilityDto,
  ): Promise<string> {
    const booking = this.bookingProcessService.startSearch(telegramUserId, activeBooking, bookingData);

    const roomFound = await this.findAvailableRoom(bookingData.checkIn, bookingData.checkOut, bookingData.capacity);

    let botReply: string;
    if (roomFound) {
      this.bookingProcessService.markPendingConfirmation(booking);

      const nights = this.calculateNights(bookingData.checkIn, bookingData.checkOut);
      const totalAmount = roomFound.category.basePrice * nights;
      const depositAmount = totalAmount * DEPOSIT_PERCENTAGE;

      botReply = `Tenemos disponibilidad en nuestra ${roomFound.category.name} del ${bookingData.checkIn} al ${bookingData.checkOut} por $${roomFound.category.basePrice} la noche.\n\nEl total de tu estadía (${nights} noches) sería de $${totalAmount}, con una seña del 30% de $${depositAmount} para confirmar la reserva.\n\n¿Te gustaría que confirmemos la reserva?`;
    } else {
      this.bookingProcessService.markInProgress(booking);
      botReply = `Lamentablemente no nos quedan habitaciones para ${bookingData.capacity} personas en esas fechas. ¿Buscamos otras fechas?`;
    }

    return botReply;
  }

  async confirmReservation(telegramUserId: string, activeBooking: BookingProcess, guestData: ConfirmReservationDto): Promise<string> {
    const savedCheckIn = activeBooking.checkIn as string;
    const savedCheckOut = activeBooking.checkOut as string;
    const capacity = activeBooking.capacity as number;

    const roomToBook = await this.findAvailableRoom(savedCheckIn, savedCheckOut, capacity);

    let botReply: string;
    if (roomToBook) {
      const checkInDate = parseDate(savedCheckIn);
      const checkOutDate = parseDate(savedCheckOut);
      const nights = this.calculateNights(savedCheckIn, savedCheckOut);
      const totalAmount = roomToBook.category.basePrice * nights;
      const depositAmount = totalAmount * DEPOSIT_PERCENTAGE;

      const newReservation = this.reservationRepository.create({
        room: roomToBook,
        telegramUserId,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        totalAmount,
        depositAmount,
        guestFullName: guestData.fullName,
        guestDni: guestData.dni,
      });

      this.reservationRepository.persist(newReservation);
      this.bookingProcessService.markCompleted(activeBooking);

      const { preferenceId, initPoint } = await this.paymentService.createPreference(newReservation, guestData);
      newReservation.mpPreferenceId = preferenceId;
      newReservation.mpInitPoint = initPoint;

      botReply = `¡Listo! Tu reserva en la ${roomToBook.category.name} ha sido confirmada con éxito del ${savedCheckIn} al ${savedCheckOut}. El total de la estadía es de $${totalAmount}, y la seña a abonar para confirmarla es de $${depositAmount}.\n\nPara confirmar tu reserva, aboná la seña acá: ${initPoint}`;
    } else {
      botReply = `Uy, parece que alguien acaba de reservar la última habitación disponible para esas fechas mientras hablábamos. ¿Te gustaría buscar otra fecha?`;
      this.bookingProcessService.markInProgress(activeBooking);
    }

    return botReply;
  }

  private calculateNights(checkIn: string, checkOut: string): number {
    return (parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / (1000 * 3600 * 24);
  }

  private async findAvailableRoom(checkIn: string, checkOut: string, capacity: number): Promise<Room | null> {
    const overlappingReservations = await this.reservationRepository.findOverlapping(parseDate(checkIn), parseDate(checkOut));
    const reservedRoomIds = overlappingReservations.map(r => r.room.id);

    const availableRooms = await this.roomRepository.findByCapacityExcluding(capacity, reservedRoomIds);

    return availableRooms.length > 0 ? availableRooms[0] : null;
  }
}
