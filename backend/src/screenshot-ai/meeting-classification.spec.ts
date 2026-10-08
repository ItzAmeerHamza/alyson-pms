import { describe, expect, it } from 'vitest';
import { applyMeetingAiClassification } from './meeting-classification';
import { ScreenshotAiAnalysisResult } from './screenshot-ai.types';
import { hasVideoMeetingEvidence } from '../pulse/meeting-context';

function distractionResult(): ScreenshotAiAnalysisResult {
  return {
    activity_type: 'media',
    category: 'distraction',
    is_work_related: false,
    confidence_score: 80,
    distraction_score: 90,
    description: 'Secondary monitor shows a video site.',
    summary: 'Secondary monitor shows a video site.',
    productivity_flag: 'off_task',
  };
}

describe('applyMeetingAiClassification', () => {
  it('keeps a non-meeting distraction as-is', () => {
    const input = distractionResult();
    expect(
      applyMeetingAiClassification(input, {
        appName: 'Google Chrome',
        windowTitle: 'YouTube',
        ocrText: 'Recommended videos',
      }),
    ).toEqual(input);
  });

  it('forces productive when Meet is the focused window even if AI saw the other monitor', () => {
    const out = applyMeetingAiClassification(distractionResult(), {
      appName: 'Google Chrome',
      windowTitle: 'Meet - Daily standup - Google Chrome',
      ocrText: 'YouTube Home Recommended',
    });
    expect(out.category).toBe('productive');
    expect(out.activity_type).toBe('communication');
    expect(out.is_work_related).toBe(true);
    expect(out.distraction_score).toBe(0);
    expect(out.confidence_score).toBeGreaterThanOrEqual(70);
    expect(out.productivity_flag).toBe('on_task');
  });

  it('forces productive when OCR sees Meet on a dual-screen stitch and Word is focused', () => {
    expect(
      hasVideoMeetingEvidence(
        'Microsoft Word',
        'Notes.docx',
        'meet.google.com/abc-defg-hij You are presenting Notes.docx',
      ),
    ).toBe(true);

    const out = applyMeetingAiClassification(distractionResult(), {
      appName: 'Microsoft Word',
      windowTitle: 'Notes.docx',
      ocrText: 'meet.google.com/abc-defg-hij You are presenting',
    });
    expect(out.category).toBe('productive');
    expect(out.is_work_related).toBe(true);
    expect(out.distraction_score).toBe(0);
  });
});
