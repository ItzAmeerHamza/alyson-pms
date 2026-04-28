import {
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  Query,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { ScreenshotsService } from './screenshots.service';

@ApiTags('screenshots')
@ApiBearerAuth()
@Controller('api/screenshots')
@UseGuards(AuthGuard, RolesGuard)
export class ScreenshotsController {
  constructor(private screenshotsService: ScreenshotsService) {}

  @Post('batch')
  @ApiOperation({ summary: 'Upload batch of screenshots (max 10)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('screenshots', 10))
  async uploadBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    if (files.length > 10) {
      throw new BadRequestException('Maximum 10 files allowed per batch');
    }

    return this.screenshotsService.uploadBatch(files, req.user.id, req.user.organization_id);
  }

  @Get()
  @ApiOperation({ summary: 'Get screenshots' })
  async getScreenshots(
    @Request() req,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('user_id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    // Admins and managers can view other users' screenshots
    const targetUserId = 
      (req.user.role === 'admin' || req.user.role === 'manager') && userId 
        ? userId 
        : req.user.id;

    return this.screenshotsService.getScreenshots(
      targetUserId,
      startDate,
      endDate,
      limit,
      req.user.organization_id,
    );
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Get screenshots timeline' })
  async getTimeline(
    @Request() req,
    @Query('date') date?: string,
    @Query('user_id') userId?: string,
  ) {
    const targetUserId = 
      (req.user.role === 'admin' || req.user.role === 'manager') && userId 
        ? userId 
        : req.user.id;

    return this.screenshotsService.getTimeline(targetUserId, date);
  }

  @Get('activity-summary')
  @ApiOperation({ summary: 'Get activity summary from screenshots' })
  async getActivitySummary(
    @Request() req,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('user_id') userId?: string,
  ) {
    const targetUserId = 
      (req.user.role === 'admin' || req.user.role === 'manager') && userId 
        ? userId 
        : req.user.id;

    return this.screenshotsService.getActivitySummary(
      targetUserId,
      startDate,
      endDate,
    );
  }

  @Get('low-activity')
  @ApiOperation({ summary: 'Get low activity periods' })
  @Roles('admin', 'manager')
  async getLowActivityPeriods(
    @Query('user_id') userId?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('threshold') threshold = 30,
  ) {
    return this.screenshotsService.getLowActivityPeriods(
      userId,
      startDate,
      endDate,
      threshold,
      undefined, // org_id not available on unauthenticated admin endpoint
    );
  }
} 