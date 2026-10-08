import { ScreenshotAiAnalysisResult } from './screenshot-ai.types';
import { hasVideoMeetingEvidence } from '../pulse/meeting-context';

/**
 * Dual-monitor stitches often OCR the idle second screen (desktop, YouTube,
 * email). If the capture is a live meeting, that must never become
 * non-productive / non-effective.
 */
export function applyMeetingAiClassification(
  result: ScreenshotAiAnalysisResult,
  evidence: {
    appName?: string | null;
    windowTitle?: string | null;
    ocrText?: string | null;
  },
): ScreenshotAiAnalysisResult {
  if (!hasVideoMeetingEvidence(evidence.appName, evidence.windowTitle, evidence.ocrText)) {
    return result;
  }

  return {
    ...result,
    activity_type: 'communication',
    category: 'productive',
    is_work_related: true,
    distraction_score: 0,
    confidence_score: Math.max(result.confidence_score || 0, 70),
    productivity_flag: 'on_task',
  };
}
