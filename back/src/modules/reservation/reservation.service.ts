import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';
import { Room } from '../../infrastructure/database/entities/Room.entity';
import { SearchAvailabilityDto } from '../bookingProcess/dto/searchAvailability.dto';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { RoomRepository } from '../room/room.repository';
import { ReservationRepository } from './reservation.repository';
import { parseDate } from '../bookingProcess/date.util';
import { PaymentService, RESERVATION_HOLD_MINUTES } from '../payment/payment.service';
import { escapeHtml, htmlLink } from '../telegram/telegram.format';
import { ConfirmReservationDto } from './dto/confirmReservation.dto';

const DEPOSIT_PERCENTAGE = 0.3;

@Injectable()
export class ReservationService {
  constructor(
    private readonly bookingProcessService: BookingProcessService,
    private readonly roomRepository: RoomRepository,
    private readonly reservationRepository: ReservationRepository,
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
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

      botReply = `Tenemos disponibilidad en nuestra ${escapeHtml(roomFound.category.name)} del ${bookingData.checkIn} al ${bookingData.checkOut} por $${roomFound.category.basePrice} la noche.\n\nEl total de tu estadía (${nights} noches) sería de $${totalAmount}, con una seña del 30% de $${depositAmount} para reservarla.\n\n¿Querés que te la reserve? Te paso el link para abonar la seña.`;
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

      // Link al formulario de prepago del front, que muestra el resumen y de ahí manda al
      // checkout de Mercado Pago. En dev, con FRONTEND_BASE_URL apuntando a localhost, Telegram
      // descarta el href y la URL queda como texto para copiar; con un dominio real es clickeable.
      const frontendBaseUrl = this.configService.getOrThrow<string>('FRONTEND_BASE_URL');
      const paymentFormUrl = `${frontendBaseUrl}/payment/form/${newReservation.id}`;

      botReply = [
        `Te estoy guardando la ${escapeHtml(roomToBook.category.name)} del ${savedCheckIn} al ${savedCheckOut}, a nombre de ${escapeHtml(guestData.fullName)}.`,
        '',
        `Total de la estadía: $${totalAmount}`,
        `Seña para reservarla: $${depositAmount}`,
        '',
        `⏳ <b>Todavía no está confirmada.</b> Te guardo la habitación ${RESERVATION_HOLD_MINUTES} minutos; si en ese rato no entra la seña, se libera para otro huésped.`,
        '',
        '👉 Aboná la seña acá:',
        // La etiqueta del link es la URL misma: se ve la dirección completa y además queda
        // clickeable, sin depender de que el cliente de Telegram la detecte solo.
        htmlLink(paymentFormUrl, paymentFormUrl),
        '',
        'Apenas se acredite el pago te escribo por acá y ahí sí queda confirmada.',
      ].join('\n');
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
