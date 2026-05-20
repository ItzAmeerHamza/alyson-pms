// Activity Issues Constants
import { IssueCategory, IssueType, IssueSeverity, FilterOptions } from './types';

// Issue category definitions with visual styling
export const ISSUE_CATEGORIES: Record<IssueType, IssueCategory> = {
  duplicate_screenshots: {
    type: 'duplicate_screenshots',
    label: 'Duplicate Screenshots',
    description: 'Repeated identical screenshots indicating idle or inactive time',
    severity: 'high',
    icon: 'Copy',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  low_activity: {
    type: 'low_activity',
    label: 'Low Activity',
    description: 'Screenshots showing minimal keyboard/mouse activity',
    severity: 'medium',
    icon: 'TrendingDown',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  social_media_app: {
    type: 'social_media_app',
    label: 'Social Media Apps',
    description: 'Desktop applications used for social media during work hours',
    severity: 'medium',
    icon: 'Smartphone',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  social_media_url: {
    type: 'social_media_url',
    label: 'Social Media Websites',
    description: 'AI-detected social media activity during work hours',
    severity: 'medium',
    icon: 'Globe',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  entertainment: {
    type: 'entertainment',
    label: 'Entertainment',
    description: 'AI-detected streaming services and media consumption during work',
    severity: 'medium',
    icon: 'Play',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  gaming: {
    type: 'gaming',
    label: 'Gaming',
    description: 'AI-detected gaming activity during work hours',
    severity: 'high',
    icon: 'Gamepad2',
    color: 'text-pink-700',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
  },
  excessive_idle: {
    type: 'excessive_idle',
    label: 'Excessive Idle',
    description: 'Prolonged periods of inactivity detected',
    severity: 'medium',
    icon: 'Clock',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
};

// Detection thresholds
export const ISSUE_THRESHOLDS = {
  LOW_ACTIVITY_PERCENT: 30,
  CONSECUTIVE_DUPLICATES: 3,
  EXCESSIVE_IDLE_PERCENT: 20,
  SOCIAL_MEDIA_MINUTES_DAILY: 15,
  ENTERTAINMENT_MINUTES_DAILY: 30,
};

// Severity colors for badges
export const SEVERITY_COLORS: Record<IssueSeverity, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
  critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
};

/**
 * @deprecated REMOVED - AI Vision now classifies all apps dynamically
 * 
 * Teams/Slack/Zoom are NOT always social media:
 * - Teams meeting = productive
 * - Teams personal chat = social_media
 * - WhatsApp business = productive
 * - WhatsApp personal = social_media
 * 
 * AI analyzes the actual screenshot content to decide.
 * See: vision_category field in screenshots table
 */
export const SOCIAL_MEDIA_APPS: string[] = [
  // EMPTY - AI decides everything now
  // Static lists caused false positives (Teams = social media when it's work)
];

/**
 * DEPRECATED: Static domain lists for Activity Issues detection
 * 
 * These lists are NO LONGER USED for Activity Issues detection.
 * Activity Issues now uses AI Vision (vision_category) for dynamic classification.
 * 
 * Benefits of AI-based detection:
 * - No false positives (e.g., Dropbox won't be flagged as social media)
 * - Context-aware (LinkedIn for job search vs scrolling feed)
 * - Auto-detects new platforms without code updates
 * - Understands visual content, not just domain names
 * 
 * These lists are kept for backwards compatibility with other modules
 * that may still reference them (URL Activity page, etc.)
 * 
 * @deprecated Use vision_category from screenshots table instead
 */
export const SOCIAL_MEDIA_DOMAINS = [
  // DEPRECATED - AI Vision now classifies dynamically
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'reddit.com', 'pinterest.com', 'snapchat.com',
];

/** @deprecated Use vision_category from screenshots table */
export const ENTERTAINMENT_DOMAINS = [
  // DEPRECATED - AI Vision now classifies dynamically
  'netflix.com', 'hulu.com', 'twitch.tv', 'spotify.com',
];

/** @deprecated Use vision_category from screenshots table */
export const GAMING_DOMAINS = [
  // DEPRECATED - AI Vision now classifies dynamically
  'steampowered.com', 'epicgames.com', 'roblox.com',
];

/**
 * @deprecated REMOVED - AI Vision now classifies gaming dynamically
 * 
 * AI can see the actual game content and classify correctly.
 * See: vision_category = 'gaming' in screenshots table
 */
export const GAMING_APPS: string[] = [
  // EMPTY - AI decides everything now
];

// Default filter options
export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  period: 'weekly',
  dateRange: {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date(),
  },
  userFilter: 'all',
  issueTypeFilter: 'all',
  severityFilter: 'all',
};

// Risk score calculation weights
export const RISK_WEIGHTS: Record<IssueType, number> = {
  duplicate_screenshots: 15,
  low_activity: 10,
  social_media_app: 8,
  social_media_url: 8,
  entertainment: 5,
  gaming: 20,
  excessive_idle: 12,
};

// Period labels
export const PERIOD_LABELS: Record<string, string> = {
  daily: 'Today',
  weekly: 'This Week',
  monthly: 'This Month',
  'last-month': 'Last Month',
  custom: 'Custom Dates',
};

// Browser app patterns (for matching screenshots to URL activity)
export const BROWSER_APPS = [
  'chrome',
  'google chrome',
  'firefox',
  'mozilla firefox',
  'safari',
  'microsoft edge',
  'edge',
  'brave',
  'arc',
  'opera',
  'vivaldi',
  'chromium',
];

