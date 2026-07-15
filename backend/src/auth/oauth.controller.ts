import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

interface TokenRequest {
  grant_type?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
}

/**
 * Time Doctor-compatible OAuth token endpoint.
 *
 * Alyson HR derives this from the API base URL's origin (`{origin}/oauth/v2/token`),
 * so it lives at the root — NOT under /timedoctor/v1.1. Only the refresh_token grant
 * is supported; it returns a fresh Palisade-style access token.
 */
@Controller('oauth/v2')
export class OAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('token')
  @HttpCode(200)
  async token(@Body() body?: TokenRequest, @Query() query?: TokenRequest) {
    return this.handle({ ...(query || {}), ...(body || {}) });
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Get('token')
  @HttpCode(200)
  async tokenGet(@Query() query?: TokenRequest) {
    return this.handle(query || {});
  }

  private handle(params: TokenRequest) {
    const grantType = params.grant_type;
    if (grantType && grantType !== 'refresh_token') {
      throw new BadRequestException('unsupported_grant_type');
    }
    const refreshToken = params.refresh_token?.trim();
    if (!refreshToken) {
      throw new BadRequestException('refresh_token is required');
    }
    return this.authService.refreshAppToken(refreshToken);
  }
}
