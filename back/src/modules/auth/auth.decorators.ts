import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../infrastructure/database/entities/User.entity';
import { AuthenticatedRequest, AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/**
 * El guard de JWT está registrado como APP_GUARD, así que todo nace protegido.
 * Este decorador es la única forma de abrir un endpoint, y se puede poner tanto
 * sobre un handler como sobre la clase entera del controller.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Evita tener que inyectar @Req() y desarmar el request en cada handler. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
});
