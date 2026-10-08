import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { DeepseekVisionService } from './deepseek-vision.service';

function service(env: Record<string, string>): DeepseekVisionService {
  return new DeepseekVisionService(new ConfigService(env));
}

function jsonResponse(body: Record<string, unknown>, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('DeepseekVisionService OpenRouter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is configured when OPENROUTER_API_KEY is set', () => {
    expect(service({ OPENROUTER_API_KEY: 'sk-or-test' }).isConfigured()).toBe(true);
  });

  it('is not configured without a key', () => {
    expect(service({}).isConfigured()).toBe(false);
    expect(service({ DEEPSEEK_API_KEY: 'sk-ds-test' }).isConfigured()).toBe(false);
  });

  it('calls OpenRouter with the DeepSeek model slug', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        model: 'deepseek/deepseek-chat',
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 10 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await service({ OPENROUTER_API_KEY: 'sk-or-test' }).chatJson({
      systemPrompt: 'sys',
      userContent: 'hello',
    });

    expect(result.parsed).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-or-test');
    expect(init.headers['HTTP-Referer']).toBe('https://app.alyson.ai');
    expect(JSON.parse(init.body).model).toBe('deepseek/deepseek-chat');
  });
});

describe('DeepseekVisionService screenshot copy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks for this-frame activity without OCR wording and stores a frame status', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        model: 'deepseek/deepseek-chat',
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'We saw in OCR that they were editing App.tsx in Cursor.',
                feedback_for_employee: 'Stay on the current file.',
                activity_type: 'development',
                category: 'productive',
                is_work_related: true,
                confidence_score: 88,
                distraction_score: 5,
                productivity_flag: 'on_task',
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result, raw } = await service({ OPENROUTER_API_KEY: 'sk-or-test' }).analyzeScreenshot({
      imageBase64: 'abc',
      mimeType: 'image/png',
      appName: 'Cursor',
      windowTitle: 'App.tsx',
      capturedAt: '2026-09-22T12:00:00.000Z',
      imageContext: { ocrText: 'App.tsx export function Screen', labels: [], route: 'tesseract' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as { messages: Array<{ content: string }> };
    const userContent = body.messages[1].content;
    expect(userContent).toMatch(/On-screen content in this frame/);
    expect(userContent).not.toMatch(/\bOCR\b/);
    expect(userContent).not.toMatch(/extracted from/i);

    expect(result.description).toBe('they were editing App.tsx in Cursor.');
    expect(result.description.toLowerCase()).not.toMatch(/ocr/);
    expect(result.description).not.toMatch(/Stay on the current file/);
    expect(result.feedback).toBe('Stay on the current file.');
    expect(result.productivity_flag).toBe('on_task');
    expect(raw.productivity_flag).toBe('on_task');
    expect((raw.parsed as { productivity_flag: string }).productivity_flag).toBe('on_task');
  });
});
