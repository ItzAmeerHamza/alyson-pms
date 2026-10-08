import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('me')
  async getMe(
    @Headers('authorization') authorization?: string,
    @Headers('x-pulse-workspace-id') workspaceId?: string,
    @Query('pulseWorkspaceId') workspaceQuery?: string,
  ) {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header missing');
    }
    const token = this.authService.extractTokenFromHeader(authorization);
    return this.authService.getAuthProfile(token, workspaceId || workspaceQuery);
  }

  /**
   * Palisade-style login. Send the Cognito id token (Authorization: Bearer <idToken>
   * or body { idToken }); receive an app token to use as x-auth-token / access_token.
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post('token')
  @HttpCode(200)
  async issueToken(
    @Headers('authorization') authorization?: string,
    @Body() body?: { idToken?: string },
  ) {
    const cognitoToken = authorization
      ? this.authService.extractTokenFromHeader(authorization)
      : body?.idToken?.trim();
    if (!cognitoToken) {
      throw new UnauthorizedException('Cognito id token is required');
    }
    return this.authService.issueAppToken(cognitoToken);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get('organizations/by-slug/:slug')
  async getOrganizationBySlug(@Param('slug') slug: string) {
    const org = await this.authService.getOrganizationBySlug(slug);
    if (!org || !org.is_active) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }
}
