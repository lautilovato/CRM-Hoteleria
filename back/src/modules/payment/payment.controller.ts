import { Controller, Post, Get, Param, Body, Headers, HttpCode, HttpStatus, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentRepository } from './payment.repository';
import { ReservationSummaryDto } from './dto/reservationSummary.dto';
import { Response } from 'express';
import { Query, Res } from '@nestjs/common';

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
    @Body() body: any,
    @Query() query: any,
  ) {
    const dataId = body?.data?.id || query?.id || body?.id;
    const eventType = body?.type || query?.topic || body?.topic;

    if (!dataId) {
      this.logger.warn(`Webhook ignorado: sin ID válido. Body: ${JSON.stringify(body)} | Query: ${JSON.stringify(query)}`);
      return { received: true };
    }

    if (eventType !== 'payment') {
      this.logger.warn(`Ignorando evento de tipo: ${eventType}`);
      return { received: true };
    }

    this.logger.log(`✅ Procesando webhook de pago ID: ${dataId}`);

    const payment = await this.paymentService.getPayment(dataId);
    
    if (!payment.external_reference || !payment.id) {
      return { received: true };
    }

    const reservation = await this.paymentRepository.findReservationById(payment.external_reference);
    if (!reservation) {
      this.logger.warn(`Reserva no encontrada: external_reference=${payment.external_reference}`);
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

  @Get('success')
    getSuccessPage(@Query('reservationId') reservationId: string) {
      return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reserva Confirmada</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 flex items-center justify-center h-screen">
          <div class="bg-white p-8 rounded-lg shadow-md text-center max-w-sm">
            <div class="text-green-500 mb-4">
              <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">¡Salió todo ok!</h1>
            <p class="text-gray-600 mb-6">Tu pago se procesó correctamente. Ya podés cerrar esta página.</p>
            ${reservationId ? `<a href="/payment/receipt/${reservationId}" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">Descargar Comprobante PDF</a>` : ''}
          </div>
        </body>
        </html>
      `;
    }

    @Get('receipt/:id')
    async downloadReceipt(@Param('id') id: string, @Res() res: Response) {
      try {
        const buffer = await this.paymentService.generateReceiptPDF(id);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="reserva-${id}.pdf"`,
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      } catch (error) {
        console.error('ERROR REAL DEL PDF:', error);
        throw new NotFoundException('No se pudo generar el comprobante');
      }
    }

}
