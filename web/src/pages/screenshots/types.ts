// Screenshot viewer types and interfaces

export interface Screenshot {
  id: string;
  user_id: string;
  project_id: string | null;
  captured_at: string;
  image_url: string;
  activity_percent: number;
  focus_percent: number;
  mouse_clicks?: number;
  keystrokes?: number;
  mouse_movements?: number;
  is_blurred?: boolean;
  active_window_title?: string;
  url?: string;
  window_title?: string;
  app_name?: string;
  ai_tags?: string[];
  ai_description?: string | null;
  content_category?: 'productive' | 'neutral' | 'social_media' | 'entertainment' | 'gaming' | 'news' | 'shopping' | 'pending_analysis';
  distraction_score?: number;
  ai_confidence?: number;
  ai_analyzed_at?: string | null;
  ai_analysis_status?: 'pending' | 'processing' | 'completed' | 'failed';
  is_duplicate?: boolean;
  duplicate_reason?: string;
  duplicate_hash?: string;
  duplicate_group_hash?: string;
  duplicate_matched_id?: string;
  // New AI-enhanced fields
  category?: string;
  activity_type?: string;
  confidence_score?: number;
  ai_metadata?: {
    reasoning?: string[];
    tags?: string[];
    privacy_risk_score?: number;
    privacy_concerns?: string[];
    meeting_detected?: boolean;
    analysis_method?: string;
    image_description?: string | null;
    /** Rich structured vision output (workforce / distraction / browser context) when vision model returns the intelligence schema */
    screenshot_intelligence?: Record<string, unknown>;
    /** deepseek_text = JSON from DeepSeek chat without pixels; multimodal = VISION_API_* or VL */
    screenshot_intelligence_source?: 'deepseek_text' | 'multimodal';
    /** True only when a multimodal API actually saw image pixels */
    pixels_vision_used?: boolean;
    /** Legacy: true only for pixel vision; prefer pixels_vision_used + description_source */
    vision_used?: boolean;
    description_source?: 'vision' | 'screenshot_intelligence_text' | 'text-fallback' | string;
  };
  // Alert integration
  alert_id?: string;
  consecutive_duplicate_count?: number;
  idle_inferred?: boolean;
  is_work_related?: boolean;
  vision_analysis?: any;
  vision_content?: string;
  ai_model_used?: string;
  // Vision validation fields
  needs_vision_validation?: boolean;
  vision_validated_at?: string | null;
  vision_category?: string;
  vision_confidence?: number;
  vision_detected_content?: string;
  duplicate_confidence?: 'high' | 'medium' | 'low' | 'manual';
  vision_privacy_concerns?: string[];
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface TimeGroup {
  timeSlot: string;
  screenshots: Screenshot[];
  totalActivity: number;
  activeTime: number;
  idleTime: number;
  avgProductivity: number;
  employeeName: string;
  employeeId: string;
  period: {
    start: string;
    end: string;
  };
}

export interface ActivityBreakdown {
  screenshot_id: string;
  activity_level: number;
  productivity_score: number;
  time_spent_seconds: number;
  category: 'productive' | 'neutral' | 'unproductive';
  detected_apps: string[];
  urls_visited: string[];
  interaction_quality: 'high' | 'medium' | 'low';
}

export interface AIContentPattern {
  domains: string[];
  apps: string[];
  keywords: string[];
  score: number;
}

export interface ContentCategoryDisplay {
  color: string;
  icon: any;
  label: string;
  severity: 'none' | 'low' | 'medium' | 'high';
}

export interface DistractionBadge {
  color: string;
  label: string;
  icon: any;
}

export interface AnalysisResult {
  category: string;
  tags: string[];
  distractionScore: number;
  reasoning: string[];
}

export interface FilterOptions {
  selectedDate: string;
  userFilter: string;
  projectFilter: string;
  contentFilter: string;
  distractionFilter: string;
  searchTerm: string;
  viewMode: 'time-grouped' | 'activity-breakdown' | 'grid';
}

export interface ScreenshotStats {
  total: number;
  avgActivity: number;
  activePeriods: number;
  idlePeriods: number;
  productiveShots: number;
  distractedShots: number;
  // Newly added summary metrics
  totalSessions: number;
  aiCompleted: number;
  aiPending: number;
  // Duplicate detection stats
  duplicateCount: number;
  duplicateGroups: number;
  lowActivityCount: number;
  totalHoursWorked: number;
} 