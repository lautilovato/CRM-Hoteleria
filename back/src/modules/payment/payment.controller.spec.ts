import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentRepository } from './payment.repository';
import { ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';

describe('PaymentController', () => {
  let controller: PaymentController;
  let paymentService: PaymentService;
  let paymentRepository: PaymentRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PaymentService,
          useValue: {
            verifyWebhookSignature: jest.fn(),
            getPayment: jest.fn(),
            notifyPaymentApproved: jest.fn(),
          },
        },
        {
          provide: PaymentRepository,
          useValue: {
            findReservationById: jest.fn(),
            markConfirmed: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    paymentService = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get<PaymentRepository>(PaymentRepository);
  });

  describe('handleWebhook', () => {
    const headers = { xSignature: 'ts=1,v1=abc', xRequestId: 'req-1' };

    it('responde sin procesar si faltan datos en el body o headers', async () => {
      const result = await controller.handleWebhook({ type: 'payment' }, '', '');

      expect(result).toEqual({ received: true });
      expect(paymentService.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException si la firma no es válida', async () => {
      jest.spyOn(paymentService, 'verifyWebhookSignature').mockReturnValue(false);

      await expect(
        controller.handleWebhook({ type: 'payment', data: { id: 'pay-1' } }, headers.xSignature, headers.xRequestId),
      ).rejects.toThrow(UnauthorizedException);

      expect(paymentService.getPayment).not.toHaveBeenCalled();
    });

    it('no hace nada si el tipo de notificación no es "payment"', async () => {
      jest.spyOn(paymentService, 'verifyWebhookSignature').mockReturnValue(true);

      const result = await controller.handleWebhook(
        { type: 'merchant_order', data: { id: 'pay-1' } },
        headers.xSignature,
        headers.xRequestId,
      );

      expect(result).toEqual({ received: true });
      expect(paymentService.getPayment).not.toHaveBeenCalled();
    });

    it('confirma la reserva y notifica al usuario cuando el pago está aprobado', async () => {
      jest.spyOn(paymentService, 'verifyWebhookSignature').mockReturnValue(true);
      jest.spyOn(paymentService, 'getPayment').mockResolvedValue({ id: 999, status: 'approved', external_reference: 'reservation-1' } as any);

      const reservation: any = {
        id: 'reservation-1',
        telegramUserId: '123456789',
        checkIn: new Date(2026, 9, 10),
        checkOut: new Date(2026, 9, 15),
        status: ReservationStatus.PENDING_PAYMENT,
        mpPaymentId: undefined,
      };
      jest.spyOn(paymentRepository, 'findReservationById').mockResolvedValue(reservation);

      const result = await controller.handleWebhook(
        { type: 'payment', data: { id: 'pay-1' } },
        headers.xSignature,
        headers.xRequestId,
      );

      expect(paymentRepository.markConfirmed).toHaveBeenCalledWith(reservation, '999');
      expect(paymentService.notifyPaymentApproved).toHaveBeenCalledWith('123456789', reservation.checkIn, reservation.checkOut);
      expect(result).toEqual({ received: true });
    });

    it('no reprocesa un pago ya registrado (idempotencia)', async () => {
      jest.spyOn(paymentService, 'verifyWebhookSignature').mockReturnValue(true);
      jest.spyOn(paymentService, 'getPayment').mockResolvedValue({ id: 999, status: 'approved', external_reference: 'reservation-1' } as any);

      const reservation: any = {
        id: 'reservation-1',
        telegramUserId: '123456789',
        checkIn: new Date(2026, 9, 10),
        checkOut: new Date(2026, 9, 15),
        status: ReservationStatus.CONFIRMED,
        mpPaymentId: '999',
      };
      jest.spyOn(paymentRepository, 'findReservationById').mockResolvedValue(reservation);

      await controller.handleWebhook({ type: 'payment', data: { id: 'pay-1' } }, headers.xSignature, headers.xRequestId);

      expect(paymentRepository.markConfirmed).not.toHaveBeenCalled();
      expect(paymentService.notifyPaymentApproved).not.toHaveBeenCalled();
    });

    it('no cambia el estado si el pago no está aprobado', async () => {
      jest.spyOn(paymentService, 'verifyWebhookSignature').mockReturnValue(true);
      jest.spyOn(paymentService, 'getPayment').mockResolvedValue({ id: 999, status: 'rejected', external_reference: 'reservation-1' } as any);

      const reservation: any = { id: 'reservation-1', status: ReservationStatus.PENDING_PAYMENT, mpPaymentId: undefined };
      jest.spyOn(paymentRepository, 'findReservationById').mockResolvedValue(reservation);

      await controller.handleWebhook({ type: 'payment', data: { id: 'pay-1' } }, headers.xSignature, headers.xRequestId);

      expect(paymentRepository.markConfirmed).not.toHaveBeenCalled();
      expect(paymentService.notifyPaymentApproved).not.toHaveBeenCalled();
    });
  });

  describe('getReservationSummary', () => {
    it('lanza NotFoundException si la reserva no existe', async () => {
      jest.spyOn(paymentRepository, 'findReservationById').mockResolvedValue(null);

      await expect(controller.getReservationSummary('no-existe')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el resumen de la reserva', async () => {
      const reservation: any = {
        id: 'reservation-1',
        checkIn: new Date(2026, 9, 10),
        checkOut: new Date(2026, 9, 15),
        room: { category: { name: 'Suite' } },
        guestFullName: 'Juan Pérez',
        totalAmount: 500,
        depositAmount: 150,
        status: ReservationStatus.PENDING_PAYMENT,
        mpInitPoint: 'https://mp.example/pref-1',
      };
      jest.spyOn(paymentRepository, 'findReservationById').mockResolvedValue(reservation);

      const summary = await controller.getReservationSummary('reservation-1');

      expect(summary).toMatchObject({
        id: 'reservation-1',
        roomCategoryName: 'Suite',
        guestFullName: 'Juan Pérez',
        totalAmount: 500,
        depositAmount: 150,
        initPoint: 'https://mp.example/pref-1',
      });
    });
  });
});
