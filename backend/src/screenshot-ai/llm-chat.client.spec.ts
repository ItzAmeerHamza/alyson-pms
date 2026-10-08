import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';

const send = vi.fn();

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(function LambdaClient() {
    return { send };
  }),
  InvokeCommand: vi.fn(function InvokeCommand(input: unknown) {
    return input;
  }),
}));

import { LlmChatClient } from './llm-chat.client';
import { DeepseekVisionService } from './deepseek-vision.service';

function client(env: Record<string, string>, deepseek?: DeepseekVisionService) {
  return new LlmChatClient(
    new ConfigService(env),
    deepseek ?? new DeepseekVisionService(new ConfigService(env)),
  );
}

describe('LlmChatClient', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('is not configured without a key or function name', () => {
    expect(client({}).isConfigured()).toBe(false);
  });

  it('invokes the OpenRouter Lambda when this function has no API key', async () => {
    send.mockResolvedValueOnce({
      Payload: Buffer.from(
        JSON.stringify({
          ok: true,
          parsed: { summary: 'hi' },
          model: 'deepseek/deepseek-chat',
        }),
      ),
    });
    const llm = client({ OPENROUTER_FUNCTION_NAME: 'alyson-time-doctor-openrouter-prod' });
    expect(llm.isConfigured()).toBe(true);
    const result = await llm.chatJson({ systemPrompt: 'sys', userContent: 'user' });
    expect(result.parsed).toEqual({ summary: 'hi' });
    expect(result.model).toBe('deepseek/deepseek-chat');
    expect(send).toHaveBeenCalledOnce();
  });

  it('calls OpenRouter directly when the API key is present', async () => {
    const deepseek = {
      isConfigured: () => true,
      chatJson: vi.fn(async () => ({ parsed: { summary: 'direct' } })),
    } as unknown as DeepseekVisionService;
    const llm = new LlmChatClient(
      new ConfigService({
        OPENROUTER_API_KEY: 'sk-or-test',
        OPENROUTER_FUNCTION_NAME: 'alyson-time-doctor-openrouter-prod',
      }),
      deepseek,
    );
    const result = await llm.chatJson({ systemPrompt: 'sys', userContent: 'user' });
    expect(result.parsed).toEqual({ summary: 'direct' });
    expect(send).not.toHaveBeenCalled();
  });
});
