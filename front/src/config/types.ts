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

/* ------------------------------------------------------------------ */
/* US-5: Gestión de reservas (panel de administración)                */
/* ------------------------------------------------------------------ */

/** Espejo de `RoomStatus` del back (`Room.entity.ts`). */
export type RoomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';

/** De dónde vino la reserva: generada por el bot de Telegram o cargada a mano (CA4). */
export type ReservationOrigin = 'BOT' | 'MANUAL';

/** Habitación disponible para asignar, con su categoría ya resuelta (para el selector del form). */
export interface RoomOption {
  id: string;
  roomNumber: string;
  status: RoomStatus;
  categoryId: string;
  categoryName: string;
  capacity: number;
  basePrice: number;
}

/** Fila de la tabla de reservas del panel de administración. */
export interface AdminReservation {
  id: string;
  guestFullName: string;
  guestDni: string;
  /** Fecha en formato YYYY-MM-DD. */
  checkIn: string;
  /** Fecha en formato YYYY-MM-DD. */
  checkOut: string;
  status: ReservationStatus;
  origin: ReservationOrigin;
  totalAmount: number;
  depositAmount: number;
  room: {
    id: string;
    roomNumber: string;
    categoryName: string;
  };
  createdAt: string;
}

/** Respuesta paginada genérica de la API. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ReservationSortBy = 'checkIn' | 'createdAt' | 'status';
export type SortDirection = 'asc' | 'desc';

/** Filtros y paginación para `GET /reservations` (CA1). */
export interface ReservationListFilters {
  status?: ReservationStatus | 'ALL';
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  sortBy: ReservationSortBy;
  sortDir: SortDirection;
}

/** Datos que viajan al crear (POST) o editar (PATCH) una reserva manual. */
export interface ReservationFormData {
  guestFullName: string;
  guestDni: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  totalAmount: number;
  depositAmount: number;
}

/* ───────── Auth ───────── */

/** Espejo del enum `UserRole` del back, tal como llega serializado. */
export type UserRole = 'ADMIN' | 'EMPLOYEE';

/** Respuesta de `GET /auth/me` y campo `user` del login (UserDto). */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** ISO 8601: el `Date` de la entidad viaja como string en el JSON. */
  createdAt: string;
}

/**
 * Body exacto de `POST /auth/login`. El ValidationPipe del back usa
 * `forbidNonWhitelisted`, así que un campo de más devuelve 400 en vez de ignorarse.
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  /** Llega como '15m', no en segundos: es el string crudo de JWT_EXPIRES_IN. */
  expiresIn: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: string;
}

/** `checking` dura mientras se intenta restaurar la sesión con la cookie del refresh. */
export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  /** Devuelve el usuario para poder decidir el destino sin esperar un render. */
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export type LoginFieldErrors = Partial<Record<'email' | 'password', string>>;

export interface LoginFormProps {
  /** Si rechaza, el formulario se rehabilita y muestra el error. */
  onLogin: (credentials: LoginCredentials) => Promise<void>;
}
