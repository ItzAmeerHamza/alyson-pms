import { describe, expect, it } from 'vitest';
import {
  deriveProductivityFlag,
  sanitizeScreenshotCopy,
  visionAnalysisPayload,
} from './screenshot-ai-copy';

describe('sanitizeScreenshotCopy', () => {
  it('strips OCR pipeline language from manager-facing copy', () => {
    expect(
      sanitizeScreenshotCopy(
        'We saw in OCR that the employee was editing a TypeScript file in Cursor.',
      ),
    ).toBe('the employee was editing a TypeScript file in Cursor.');
    expect(
      sanitizeScreenshotCopy('Based on the OCR text, they are in Google Meet presenting slides.'),
    ).toBe('they are in Google Meet presenting slides.');
    expect(sanitizeScreenshotCopy('OCR shows Slack DMs and a YouTube tab.')).toBe(
      'Slack DMs and a YouTube tab.',
    );
    expect(sanitizeScreenshotCopy('Editing revenue.xlsx in Excel.')).toBe(
      'Editing revenue.xlsx in Excel.',
    );
  });
});

describe('deriveProductivityFlag', () => {
  it('keeps an explicit frame status', () => {
    expect(
      deriveProductivityFlag({ flag: 'mixed', category: 'productive', description: 'Coding and Slack' }),
    ).toBe('mixed');
  });

  it('maps activity to a frame status when the model omits it', () => {
    expect(deriveProductivityFlag({ category: 'productive', description: 'Writing code in Cursor' })).toBe(
      'on_task',
    );
    expect(deriveProductivityFlag({ category: 'distraction', description: 'Watching YouTube' })).toBe(
      'off_task',
    );
    expect(deriveProductivityFlag({ category: 'neutral', description: 'Locked screen, password prompt' })).toBe(
      'idle',
    );
    expect(deriveProductivityFlag({ category: 'neutral', description: 'System dialog' })).toBe('unclear');
  });
});

describe('visionAnalysisPayload', () => {
  it('stores frame description and status on parsed and top-level fields', () => {
    const payload = visionAnalysisPayload(
      { parsed: { description: 'We saw in OCR a spreadsheet' }, model: 'deepseek/deepseek-chat' },
      {
        activity_type: 'document',
        category: 'productive',
        is_work_related: true,
        confidence_score: 80,
        distraction_score: 0,
        description: 'Updating the Q3 revenue spreadsheet in Excel.',
        summary: 'Updating the Q3 revenue spreadsheet in Excel.',
        feedback: 'Keep the forecast tab in view while you work.',
        productivity_flag: 'on_task',
      },
    );
    expect(payload.productivity_flag).toBe('on_task');
    expect(payload.description).toBe('Updating the Q3 revenue spreadsheet in Excel.');
    expect((payload.parsed as { productivity_flag: string }).productivity_flag).toBe('on_task');
    expect((payload.parsed as { feedback_for_employee: string }).feedback_for_employee).toContain(
      'forecast tab',
    );
  });
});
