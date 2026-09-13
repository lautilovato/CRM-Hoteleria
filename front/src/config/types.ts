/** Estados de la reserva, espejo de `ReservationStatus` del back. */
export type ReservationStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED';

/** Respuesta de `GET /payment/:reservationId/summary` (ReservationSummaryDto). */
export interface ReservationSummary {
  id: string;
  checkIn: string;
  checkOut: string;
  roomCategoryName: string;
  guestFullName: string;
  totalAmount: number;
  depositAmount: number;
  status: ReservationStatus;
  /** Link de checkout de Mercado Pago; null si todavía no se generó la preferencia. */
  initPoint: string | null;
}

export interface PrepaymentFormData {
  guest: string;
  typeRoom: string;
  /** Fecha en formato YYYY-MM-DD. */
  checkIn: string;
  /** Fecha en formato YYYY-MM-DD. */
  checkOut: string;
  totalStay: number;
  advancePayment: number;
  currency?: string;
  reservationCode?: string;
}

export interface PrepaymentFormProps {
  /** Datos del formulario de prepago */
  reservation: PrepaymentFormData;
  /** Marca la seña como ya abonada (reserva confirmada antes de entrar a la pantalla). */
  alreadyPaid?: boolean;
  /** Se ejecuta al confirmar el pago. Si rechaza la promesa, el form vuelve a habilitarse. */
  onConfirmedPayment?: (reservation: PrepaymentFormData) => Promise<void> | void;
}
