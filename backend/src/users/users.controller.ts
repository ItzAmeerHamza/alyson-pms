import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { canManagePulseUsers, isPulseOrgAdmin } from '../database/time-doctor-sql';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('pulse')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Provision a new employee (admin or manager): Cognito user + RDS records. */
  @Post('users')
  async createUser(@Req() req: { user: any }, @Body() body: CreateUserDto) {
    if (!canManagePulseUsers(req.user)) {
      throw new ForbiddenException('Admin or manager role required');
    }
    // Only org admins may create other admins.
    if (body.role === 'admin' && !isPulseOrgAdmin(req.user)) {
      throw new BadRequestException('Only admins can create admin users');
    }
    return this.users.createUser(req.user, body);
  }
}
