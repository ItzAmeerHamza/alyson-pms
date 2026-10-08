export const SCREENSHOT_AI_STATUSES = [
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
  'skipped',
] as const;

export type ScreenshotAiStatus = (typeof SCREENSHOT_AI_STATUSES)[number];

export const SCREENSHOT_AI_ACTIVITY_TYPES = [
  'development',
  'communication',
  'email',
  'document',
  'design',
  'research',
  'social',
  'gaming',
  'shopping',
  'media',
  'advertising',
  'networking',
  'music',
  'general',
] as const;

export type ScreenshotActivityType = (typeof SCREENSHOT_AI_ACTIVITY_TYPES)[number];

export const SCREENSHOT_AI_CATEGORIES = [
  'productive',
  'neutral',
  'distraction',
] as const;

export type ScreenshotAiCategory = (typeof SCREENSHOT_AI_CATEGORIES)[number];

export const SCREENSHOT_AI_PRODUCTIVITY_FLAGS = [
  'on_task',
  'mixed',
  'off_task',
  'idle',
  'unclear',
] as const;

export type ScreenshotProductivityFlag = (typeof SCREENSHOT_AI_PRODUCTIVITY_FLAGS)[number];

export type ScreenshotAiJobSource = 'upload' | 'backfill' | 'manual';

export interface ScreenshotAiJobMessage {
  screenshotId: string;
  s3Key: string;
  userId: number;
  workspaceId: number | null;
  appName: string | null;
  windowTitle: string | null;
  capturedAt: string;
  source: ScreenshotAiJobSource;
}

export interface ScreenshotAiAnalysisResult {
  activity_type: ScreenshotActivityType;
  category: ScreenshotAiCategory;
  is_work_related: boolean;
  confidence_score: number;
  distraction_score: number;
  /** Plain-language description of what the employee is doing in this frame */
  description: string;
  /** Alias kept for backward compatibility */
  summary: string;
  /** Coaching copy stored separately from the frame description */
  feedback?: string;
  /** Frame-level status derived from the activity in this screenshot */
  productivity_flag: ScreenshotProductivityFlag;
}

export interface ScreenshotAiStatusCounts {
  pending: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface BackfillOptions {
  limit?: number;
  userId?: string;
  startDate?: string;
  endDate?: string;
  newestFirst?: boolean;
  includeFailed?: boolean;
  /** When set, only enqueue / retry rows in this workspace. */
  workspaceId?: number;
}

export interface ScreenshotRowForAnalysis {
  id: string;
  user_id: number;
  workspace_id: number | null;
  s3_key: string;
  captured_at: string;
  app_name: string | null;
  window_title: string | null;
  ai_analysis_status: ScreenshotAiStatus;
  ai_retry_count: number;
}
