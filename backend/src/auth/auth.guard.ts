import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, User } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
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
    try {
      request.user = await this.resolveUser(request);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid authentication');
    }
  }

  private async resolveUser(request: {
    headers: Record<string, unknown>;
    query?: Record<string, unknown>;
  }): Promise<User> {
    const xAuth = request.headers['x-auth-token'];
    if (typeof xAuth === 'string' && xAuth.trim()) {
      return this.authService.getUserFromAppToken(xAuth.trim());
    }

    const queryToken = request.query?.access_token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return this.authService.getUserFromAppToken(queryToken.trim());
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        return await this.authService.getUserFromToken(token);
      } catch {
        // Not a valid Cognito id token — try a Palisade app token in the Bearer slot.
        return this.authService.getUserFromAppToken(token);
      }
    }

    throw new UnauthorizedException('Authentication token missing');
  }
}
