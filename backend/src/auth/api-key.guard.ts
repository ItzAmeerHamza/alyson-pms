import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey =
      request.headers['x-api-key'] || request.headers['x-internal-api-key'];
    const internalKey = this.configService.get<string>('INTERNAL_API_KEY');

    if (!apiKey || !internalKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    const apiKeyBuf = Buffer.from(apiKey, 'utf-8');
    const internalKeyBuf = Buffer.from(internalKey, 'utf-8');

    if (
      apiKeyBuf.length !== internalKeyBuf.length ||
      !timingSafeEqual(apiKeyBuf, internalKeyBuf)
    ) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
