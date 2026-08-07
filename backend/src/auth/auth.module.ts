import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { TdAuthGuard } from './td-auth.guard';
import { ApiKeyGuard } from './api-key.guard';
import { RolesGuard } from './roles.guard';
import { CognitoService } from './cognito.service';
import { AuthController } from './auth.controller';
import { OAuthController } from './oauth.controller';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '1d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [AuthService, AuthGuard, TdAuthGuard, ApiKeyGuard, RolesGuard, CognitoService],
  exports: [AuthService, AuthGuard, TdAuthGuard, RolesGuard, CognitoService, ApiKeyGuard],
})
export class AuthModule {}
