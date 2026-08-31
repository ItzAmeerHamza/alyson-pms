import { describe, expect, it } from 'vitest';

/** Typical DeepSeek blob stored on time_doctor.screenshots.vision_analysis. */
function fatRow() {
  return {
    id: '4ccf7839-5d6a-4337-b325-4b20f37edfa1',
    user_id: '12',
    s3_key: 'alyson-td-screenshots/2026/08/27/shot.jpg',
    captured_at: '2026-08-27T12:00:00.000Z',
    app_name: 'Google Chrome',
    window_title: 'Sheets',
    activity_percent: 80,
    category: 'productive',
    vision_summary: 'Working in Google Sheets',
    vision_analysis: {
      model: 'deepseek-chat',
      usage: { prompt_tokens: 1200, completion_tokens: 400 },
      vision_used: true,
      vision_route: 'tesseract+deepseek',
      image_context: { ocr_chars: 1800, labels: [] as string[] },
      parsed: {
        description: 'Working in Google Sheets',
        feedback_for_employee: 'Stay on the revenue tab.',
        productivity_flag: 'on_task',
        confidence_score: 85,
      },
      ocr_text: 'A'.repeat(4000),
    },
  };
}

function slimRow(row: ReturnType<typeof fatRow>) {
  const parsed = row.vision_analysis.parsed;
  return {
    id: row.id,
    user_id: row.user_id,
    s3_key: row.s3_key,
    captured_at: row.captured_at,
    app_name: row.app_name,
    window_title: row.window_title,
    activity_percent: row.activity_percent,
    category: row.category,
    vision_summary: row.vision_summary,
    description: row.vision_summary,
    feedback: parsed.feedback_for_employee,
    productivity_flag: parsed.productivity_flag,
    vision_used: true,
  };
}

describe('screenshot list payload', () => {
  it('slim rows drop the vision_analysis blob and shrink JSON a lot', () => {
    const page = Array.from({ length: 12 }, fatRow);
    const slim = page.map(slimRow);
    const fatBytes = Buffer.byteLength(JSON.stringify(page));
    const slimBytes = Buffer.byteLength(JSON.stringify(slim));
    expect(slim.every((r) => !('vision_analysis' in r))).toBe(true);
    expect(slimBytes).toBeLessThan(fatBytes / 5);
  });
});
