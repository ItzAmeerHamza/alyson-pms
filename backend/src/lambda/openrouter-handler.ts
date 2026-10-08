import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeepseekVisionService } from '../screenshot-ai/deepseek-vision.service';

/**
 * Non-VPC Lambda: the only place the API and leave-scan call OpenRouter.
 * Holds OPENROUTER_API_KEY. API Lambda invokes it through the Lambda VPC endpoint.
 */
export type OpenRouterChatEvent = {
  systemPrompt?: string;
  userContent?: string;
  maxTokens?: number;
  temperature?: number;
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [DeepseekVisionService],
})
class OpenRouterAppModule {}

let chat: DeepseekVisionService | null = null;

async function getChat(): Promise<DeepseekVisionService> {
  if (!chat) {
    const app = await NestFactory.createApplicationContext(OpenRouterAppModule, {
      logger: ['error', 'warn', 'log'],
    });
    chat = app.get(DeepseekVisionService);
  }
  return chat;
}

export const handler = async (event: OpenRouterChatEvent) => {
  const systemPrompt = String(event?.systemPrompt || '').trim();
  const userContent = String(event?.userContent || '').trim();
  if (!systemPrompt || !userContent) {
    return { ok: false, message: 'systemPrompt and userContent are required' };
  }

  try {
    const service = await getChat();
    const result = await service.chatJson({
      systemPrompt,
      userContent,
      maxTokens: event.maxTokens,
      temperature: event.temperature,
    });
    return { ok: true, parsed: result.parsed, model: result.model, usage: result.usage };
  } catch (err) {
    console.error(
      `openrouter chat failed: ${err instanceof Error ? err.message : 'request failed'}`,
    );
    return { ok: false, message: 'OpenRouter request failed' };
  }
};
