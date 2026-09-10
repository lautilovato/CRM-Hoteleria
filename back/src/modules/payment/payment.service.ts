import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference, Payment, WebhookSignatureValidator } from 'mercadopago';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Reservation } from '../../infrastructure/database/entities/Reservation.entity';
import { ConfirmReservationDto } from '../reservation/dto/confirmReservation.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentRepository } from './payment.repository';
import { Logger } from '@nestjs/common';

@Injectable()
export class PaymentService {
  private client: MercadoPagoConfig;
  private webhookSecret: string;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly paymentRepository: PaymentRepository,
    @InjectBot() private readonly bot: Telegraf<Context>,
  ) {
    const accessToken = this.configService.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) throw new Error('Falta MERCADOPAGO_ACCESS_TOKEN');

    const webhookSecret = this.configService.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    if (!webhookSecret) throw new Error('Falta MERCADOPAGO_WEBHOOK_SECRET');

    this.webhookSecret = webhookSecret;
    this.client = new MercadoPagoConfig({ accessToken });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseExpiredReservations(): Promise<void> {
    const expirationMinutes = 30;
    const cutoffDate = new Date(Date.now() - expirationMinutes * 60 * 1000);

    const expired = await this.paymentRepository.findExpiredPendingReservations(cutoffDate);

    if (expired.length === 0) {
      return;
    }

    await this.paymentRepository.cancelExpiredReservations(expired);
    this.logger.log(`Canceladas ${expired.length} reserva(s) vencidas por falta de pago`);
  }

  async createPreference(reservation: Reservation, guestData: ConfirmReservationDto): Promise<{ preferenceId: string; initPoint: string }> {
    const baseUrl = this.configService.get<string>('APP_BASE_URL');

    const preference = await new Preference(this.client).create({
      body: {
        items: [
          {
            id: reservation.id,
            title: `Seña de reserva de hotel (${reservation.room.category?.name ?? 'habitación'})`,
            quantity: 1,
            unit_price: Number(reservation.depositAmount),
            currency_id: 'ARS',
          },
        ],
        payer: {
          name: guestData.fullName,
          identification: { type: 'DNI', number: guestData.dni },
        },
        external_reference: reservation.id,
        notification_url: baseUrl ? `${baseUrl}/payment/webhook` : undefined,
      },
    });

    if (!preference.id || !preference.init_point) {
      throw new Error('Mercado Pago no devolvió una preferencia válida');
    }

    return { preferenceId: preference.id, initPoint: preference.init_point };
  }

  async getPayment(paymentId: string) {
    return new Payment(this.client).get({ id: paymentId });
  }

  verifyWebhookSignature(xSignature: string, xRequestId: string, dataId: string): boolean {
    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId,
        secret: this.webhookSecret,
      });
      return true;
    } catch {
      return false;
    }
  }

  async notifyPaymentApproved(telegramUserId: string, checkIn: Date | string, checkOut: Date | string): Promise<void> {
    const checkInText = new Date(checkIn).toLocaleDateString('es-AR');
    const checkOutText = new Date(checkOut).toLocaleDateString('es-AR');
    await this.bot.telegram.sendMessage(
      telegramUserId,
      `¡Recibimos tu pago! Tu reserva del ${checkInText} al ${checkOutText} quedó confirmada. ¡Te esperamos!`,
    );
  }
}
