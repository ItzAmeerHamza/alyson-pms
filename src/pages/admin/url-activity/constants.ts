// Constants for URL Activity module
import { FilterOptions } from './types';

/**
 * @deprecated NOT USED FOR DETECTION - AI Vision classifies dynamically
 * 
 * These domains are kept for backwards compatibility only.
 * Activity Issues detection now uses vision_category from screenshots table.
 * 
 * AI analyzes actual screenshot content:
 * - LinkedIn job search = productive
 * - LinkedIn scrolling feed = social_media
 * - YouTube tutorial = productive
 * - YouTube music = entertainment
 */
export const SOCIAL_MEDIA_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'snapchat.com',
  // linkedin.com REMOVED - can be work (job search) or social (scrolling)
  'reddit.com',
  'pinterest.com',
  'tumblr.com',
  // Communication apps REMOVED - context dependent
  'threads.net',
  'mastodon.social',
  'vk.com',
  'weibo.com',
];

// Work/development domains
export const WORK_DOMAINS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'stackexchange.com',
  'dev.to',
  'medium.com',
  'notion.so',
  'atlassian.net',
  'jira.com',
  'confluence.com',
  'trello.com',
  'asana.com',
  'monday.com',
  'slack.com',
  'teams.microsoft.com',
  'zoom.us',
  'meet.google.com',
  'figma.com',
  'canva.com',
  'docs.google.com',
  'office.com',
  'sharepoint.com',
];

// Entertainment domains
export const ENTERTAINMENT_DOMAINS = [
  'youtube.com',
  'netflix.com',
  'spotify.com',
  'twitch.tv',
  'hulu.com',
  'primevideo.com',
  'disneyplus.com',
  'soundcloud.com',
  'vimeo.com',
  'dailymotion.com',
];

// News domains
export const NEWS_DOMAINS = [
  'bbc.com',
  'cnn.com',
  'nytimes.com',
  'theguardian.com',
  'reuters.com',
  'bloomberg.com',
  'wsj.com',
  'news.google.com',
  'news.yahoo.com',
];

// Shopping domains
export const SHOPPING_DOMAINS = [
  'amazon.com',
  'ebay.com',
  'aliexpress.com',
  'walmart.com',
  'target.com',
  'etsy.com',
  'shopify.com',
];

// Search engine domains
export const SEARCH_DOMAINS = [
  'google.com',
  'bing.com',
  'duckduckgo.com',
  'yahoo.com',
  'baidu.com',
];

// Communication domains
export const COMMUNICATION_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'mail.yahoo.com',
  'protonmail.com',
  'slack.com',
  'teams.microsoft.com',
  'zoom.us',
  'meet.google.com',
  'skype.com',
];

// Colors for charts
export const CHART_COLORS = {
  primary: '#8884d8',
  success: '#82ca9d',
  warning: '#ffc658',
  danger: '#ff7c7c',
  info: '#8dd1e1',
  purple: '#a78bfa',
  pink: '#f472b6',
  green: '#4ade80',
  blue: '#60a5fa',
  orange: '#fb923c',
  red: '#ef4444',
  gray: '#9ca3af',
};

export const CATEGORY_COLORS = {
  Work: CHART_COLORS.green,
  'Social Media': CHART_COLORS.red,
  Entertainment: CHART_COLORS.warning,
  Development: CHART_COLORS.blue,
  Communication: CHART_COLORS.purple,
  Search: CHART_COLORS.info,
  Productivity: CHART_COLORS.success,
  News: CHART_COLORS.orange,
  Shopping: CHART_COLORS.pink,
  Other: CHART_COLORS.gray,
};

// Date range presets
export const DATE_PRESETS = [
  { id: 'today' as const, label: 'Today', icon: '📅' },
  { id: 'yesterday' as const, label: 'Yesterday', icon: '⏮' },
  { id: 'last7days' as const, label: 'Last 7 Days', icon: '📊' },
  { id: 'last30days' as const, label: 'Last 30 Days', icon: '📈' },
  { id: 'thisWeek' as const, label: 'This Week', icon: '🗓' },
  { id: 'thisMonth' as const, label: 'This Month', icon: '📆' },
  { id: 'custom' as const, label: 'Custom', icon: '🎯' },
];

// Default filter options
export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  selectedDate: new Date().toLocaleDateString('en-CA'),
  dateRange: {
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date()
  },
  datePreset: 'last7days',
  userFilter: 'all',
  categoryFilter: 'all',
  browserFilter: 'all',
  timeOfDayFilter: 'all',
  socialMediaOnly: false,
  searchTerm: '',
  viewMode: 'list',
  groupBy: 'user',
};

// Time of day ranges
export const TIME_OF_DAY_RANGES = {
  morning: { start: 6, end: 12, label: 'Morning (6 AM - 12 PM)' },
  afternoon: { start: 12, end: 18, label: 'Afternoon (12 PM - 6 PM)' },
  evening: { start: 18, end: 24, label: 'Evening (6 PM - 12 AM)' },
  night: { start: 0, end: 6, label: 'Night (12 AM - 6 AM)' },
};

// Session duration buckets (in seconds)
export const DURATION_BUCKETS = [
  { min: 0, max: 300, label: '0-5 min' },
  { min: 300, max: 900, label: '5-15 min' },
  { min: 900, max: 1800, label: '15-30 min' },
  { min: 1800, max: 3600, label: '30-60 min' },
  { min: 3600, max: Infinity, label: '1h+' },
];

// Productivity score thresholds
export const PRODUCTIVITY_THRESHOLDS = {
  excellent: 80,
  good: 60,
  fair: 40,
  poor: 20,
};

// Chart configuration
export const CHART_CONFIG = {
  height: 300,
  margin: { top: 5, right: 30, left: 20, bottom: 5 },
  barSize: 40,
  pieOuterRadius: 80,
  pieInnerRadius: 0,
  animationDuration: 300,
};

