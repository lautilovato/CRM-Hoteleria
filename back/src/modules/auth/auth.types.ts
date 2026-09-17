import { Request } from 'express';
import { UserRole } from '../../infrastructure/database/entities/User.entity';

/** Contenido del access token. `sub` es el id del usuario, como manda el estándar JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Se prefiere una interfaz explícita antes que aumentar el namespace de Express:
 * el augmentation ambiente es invisible en el código y frágil con swc.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}
