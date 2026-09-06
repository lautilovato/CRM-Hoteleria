import { Controller, Post, Get, Param, Body, Headers, HttpCode, HttpStatus, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentRepository } from './payment.repository';
import { ReservationSummaryDto } from './dto/reservationSummary.dto';

interface MercadoPagoWebhookBody {
  type?: string;
  action?: string;
  data?: { id: string };
}

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly paymentRepository: PaymentRepository,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: MercadoPagoWebhookBody,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
  ) {
    const dataId = body?.data?.id;
    if (!dataId || !xSignature || !xRequestId) {
      return { received: true };
    }

    if (!this.paymentService.verifyWebhookSignature(xSignature, xRequestId, dataId)) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    if (body.type !== 'payment') {
      return { received: true };
    }

    const payment = await this.paymentService.getPayment(dataId);
    if (!payment.external_reference || !payment.id) {
      return { received: true };
    }

    const reservation = await this.paymentRepository.findReservationById(payment.external_reference);
    if (!reservation) {
      this.logger.warn(`Webhook de Mercado Pago sin reserva asociada: external_reference=${payment.external_reference}`);
      return { received: true };
    }

    if (reservation.mpPaymentId === String(payment.id)) {
      return { received: true };
    }

    if (payment.status === 'approved') {
      await this.paymentRepository.markConfirmed(reservation, String(payment.id));
      await this.paymentService.notifyPaymentApproved(reservation.telegramUserId, reservation.checkIn, reservation.checkOut);
    }

    return { received: true };
  }

  @Get(':reservationId/summary')
  async getReservationSummary(@Param('reservationId') reservationId: string): Promise<ReservationSummaryDto> {
    const reservation = await this.paymentRepository.findReservationById(reservationId);
    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada');
    }

    return ReservationSummaryDto.fromEntity(reservation);
  }
}
