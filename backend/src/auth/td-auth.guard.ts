import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Palisade-style auth for the Time Doctor-compatible API.
 *
 * Accepts the app token (minted by POST /auth/token) via, in order of precedence:
 *   1. `x-auth-token` header   (Palisade convention)
 *   2. `access_token` query    (Time Doctor Classic convention — keeps scripts drop-in)
 *   3. `Authorization: Bearer` header
 */
@Injectable()
export class TdAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
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

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication token missing');
    }

    request.user = await this.authService.getUserFromAppToken(token);
    return true;
  }

  private extractToken(request: {
    headers: Record<string, unknown>;
    query?: Record<string, unknown>;
  }): string | null {
    const headerToken = request.headers['x-auth-token'];
    if (typeof headerToken === 'string' && headerToken.trim()) {
      return headerToken.trim();
    }

    const queryToken = request.query?.access_token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    return null;
  }
}
