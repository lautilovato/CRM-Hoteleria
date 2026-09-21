import type { ReservationOrigin, ReservationStatus, RoomStatus } from '@/config/types';

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING_PAYMENT: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASSES: Record<ReservationStatus, string> = {
  PENDING_PAYMENT: 'bg-gold/15 text-goldLight',
  CONFIRMED: 'bg-success/20 text-successText',
  CANCELLED: 'bg-danger/15 text-dangerText',
};

/** Badge de color por estado, misma paleta que se usa en el flujo de pago del huésped. */
export function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const ORIGIN_LABEL: Record<ReservationOrigin, string> = {
  BOT: 'Chamber (Bot)',
  MANUAL: 'Manual',
};

/** Distingue visualmente el origen de la reserva (CA4): bot de Telegram vs. carga manual. */
export function OriginBadge({ origin }: { origin: ReservationOrigin }) {
  const isBot = origin === 'BOT';

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
        isBot
          ? 'border-goldLight/20 bg-surface text-textMuted'
          : 'border-goldLight/30 bg-transparent text-goldLight'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isBot ? 'bg-textMuted' : 'bg-gold'}`}
        aria-hidden
      />
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  ACTIVE: 'Activa',
  MAINTENANCE: 'Mantenimiento',
  INACTIVE: 'Deshabilitada',
};

const ROOM_STATUS_CLASSES: Record<RoomStatus, string> = {
  ACTIVE: 'bg-success/20 text-successText',
  MAINTENANCE: 'bg-gold/15 text-goldLight',
  INACTIVE: 'bg-danger/15 text-dangerText',
};

/** Badge de estado de una habitación (CA1, CA3): activa, en mantenimiento o deshabilitada. */
export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${ROOM_STATUS_CLASSES[status]}`}
    >
      {ROOM_STATUS_LABEL[status]}
    </span>
  );
}
