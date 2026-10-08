import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AssistantService } from './assistant.service';
import { parseAssistantDate, sanitizeChatHistory } from './assistant-briefing';
import { AssistantBriefingQueryDto, AssistantChatDto } from './dto/assistant.dto';

@Controller('pulse/assistant')
@UseGuards(AuthGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Employee-only briefing for the signed-in user (never another employee). */
  @Get('briefing')
  async briefing(
    @Req() req: { user: { id: string; is_super_admin?: boolean; organization_id?: string | null } },
    @Query() query: AssistantBriefingQueryDto,
  ) {
    const date = parseAssistantDate(query.date);
    if (query.date && !date) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return this.assistant.briefing(req.user, date || undefined);
  }

  /** Follow-up question about the signed-in user's own day. */
  @Post('chat')
  async chat(
    @Req() req: { user: { id: string; is_super_admin?: boolean; organization_id?: string | null } },
    @Body() body: AssistantChatDto,
  ) {
    const date = parseAssistantDate(body.date);
    if (body.date && !date) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const message = String(body.message || '').trim();
    if (!message) {
      throw new BadRequestException('message is required');
    }
    return this.assistant.chat(req.user, {
      date: date || undefined,
      message,
      history: sanitizeChatHistory(body.history),
    });
  }
}
