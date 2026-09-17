import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { AuthenticatedRequest, JwtPayload } from './auth.types';
import { UserRole } from '../../infrastructure/database/entities/User.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('No autenticado');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      // A propósito no se consulta la base en cada request: el guard queda barato y la
      // revocación efectiva ocurre en /auth/refresh, que sí mira el estado del usuario.
      request.user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch (error) {
      // Se distingue el vencimiento para que el front sepa cuándo llamar a /auth/refresh.
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('La sesión expiró');
      }

      throw new UnauthorizedException('Token inválido');
    }

    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    // Los guards globales corren antes que los de controller, así que para acá
    // JwtAuthGuard ya dejó el usuario en el request.
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('No tenés permisos para realizar esta acción');
    }

    return true;
  }
}
