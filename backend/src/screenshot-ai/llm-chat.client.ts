import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepseekVisionService } from './deepseek-vision.service';

export type LlmChatParams = {
  systemPrompt: string;
  userContent: string;
  maxTokens?: number;
  temperature?: number;
};

export type LlmChatResult = {
  parsed: Record<string, unknown>;
  model?: string;
  usage?: Record<string, unknown>;
};

/**
 * JSON chat for Coach and leave classification.
 *
 * Local / screenshot worker: calls OpenRouter directly when OPENROUTER_API_KEY is set.
 * VPC API Lambda (no NAT, 4KB env): sets OPENROUTER_FUNCTION_NAME and invokes the
 * non-VPC OpenRouter Lambda, which holds the key.
 */
@Injectable()
export class LlmChatClient {
  private readonly logger = new Logger(LlmChatClient.name);
  private readonly functionName: string;
  private readonly lambda: LambdaClient | null;

  constructor(
    config: ConfigService,
    private readonly deepseek: DeepseekVisionService,
  ) {
    this.functionName = (config.get<string>('OPENROUTER_FUNCTION_NAME') || '').trim();
    if (this.functionName && !this.deepseek.isConfigured()) {
      const region =
        config.get<string>('AWS_REGION') ||
        config.get<string>('COGNITO_REGION') ||
        'us-west-2';
      const endpoint = (config.get<string>('LAMBDA_VPC_ENDPOINT_URL') || '').trim();
      this.lambda = new LambdaClient({
        region,
        ...(endpoint ? { endpoint } : {}),
      });
      this.logger.log(
        `OpenRouter via Lambda ${this.functionName}` +
          (endpoint ? ' (VPC Lambda endpoint)' : ''),
      );
    } else {
      this.lambda = null;
    }
  }

  isConfigured(): boolean {
    return this.deepseek.isConfigured() || Boolean(this.functionName);
  }

  async chatJson(params: LlmChatParams): Promise<LlmChatResult> {
    if (this.deepseek.isConfigured()) {
      return this.deepseek.chatJson(params);
    }
    if (!this.lambda || !this.functionName) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }
    return this.invoke(params);
  }

  private async invoke(params: LlmChatParams): Promise<LlmChatResult> {
    const out = await this.lambda!.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(params)),
      }),
    );
    const raw = out.Payload ? Buffer.from(out.Payload).toString('utf8') : '';
    if (out.FunctionError) {
      this.logger.error(`OpenRouter Lambda error (${out.FunctionError})`);
      throw new Error('OpenRouter request failed');
    }

    let body: {
      ok?: boolean;
      parsed?: unknown;
      model?: string;
      usage?: Record<string, unknown>;
    };
    try {
      body = JSON.parse(raw || '{}') as typeof body;
    } catch {
      this.logger.error('OpenRouter Lambda returned non-JSON');
      throw new Error('OpenRouter request failed');
    }
    if (!body.ok || !body.parsed || typeof body.parsed !== 'object' || Array.isArray(body.parsed)) {
      this.logger.error('OpenRouter Lambda returned an unsuccessful payload');
      throw new Error('OpenRouter request failed');
    }
    return {
      parsed: body.parsed as Record<string, unknown>,
      model: body.model,
      usage: body.usage,
    };
  }
}
