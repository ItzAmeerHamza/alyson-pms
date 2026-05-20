// TypeScript interfaces for URL Activity module

export interface URLLog {
  id: string;
  url: string;
  site_url?: string | null;
  title?: string | null;
  user_id: string;
  timestamp: string;
  started_at?: string | null;
  domain?: string | null;
  browser?: string | null;
  time_log_id?: string | null;
  users?: {
    full_name: string;
    email: string;
  } | null;
}

export interface User {
  id: string;
  full_name: string;
  email: string;
}

export interface URLSession {
  sessionId: string;           // time_log_id or generated ID
  timeSlot: string;            // "14:00 - 14:30"
  userId: string;
  userName: string;
  urls: URLLog[];
  totalDuration: number;
  uniqueDomains: number;
  categoryBreakdown: CategoryCount[];
  hasSocialMedia: boolean;     // Warning flag
  socialMediaUrls: URLLog[];   // For highlighting
  startTime: Date;
  endTime: Date;
  productivityScore: number;   // 0-100
}

export interface CategoryCount {
  category: string;
  count: number;
  duration: number;
}

export interface URLStats {
  totalTime: number;
  totalSites: number;
  totalVisits: number;
  activeUsers: number;
  browsersUsed: number;
  socialMediaVisits: number;
  socialMediaPercentage: number;
  productivityScore: number;
  topSites: TopSite[];
  categoryBreakdown: CategoryStats[];
  userActivity: UserActivityStats[];
  browserBreakdown: BrowserStats[];
  timelineData: TimelineDataPoint[];
  sessionDurationDistribution: DurationBucket[];
  hourlyActivity: HourlyActivity[];
  socialMediaVsWork: {
    workSites: number;
    socialMedia: number;
    neutral: number;
    distracting: number;
  };
}

export interface TopSite {
  site: string;
  time: number;
  visits: number;
  category: string;
  isSocialMedia: boolean;
}

export interface CategoryStats {
  category: string;
  time: number;
  visits: number;
  percentage: number;
}

export interface UserActivityStats {
  userId: string;
  user: string;
  time: number;
  sites: number;
  workSites: number;
  socialMediaSites: number;
  otherSites: number;
  productivityScore: number;
}

export interface BrowserStats {
  browser: string;
  time: number;
  visits: number;
  categories: {
    work: number;
    socialMedia: number;
    neutral: number;
    distracting: number;
  };
}

export interface TimelineDataPoint {
  time: string;
  hour: number;
  total: number;
  socialMedia: number;
  work: number;
  [key: string]: string | number; // For dynamic user keys
}

export interface DurationBucket {
  range: string;
  count: number;
  percentage: number;
}

export interface HourlyActivity {
  hour: number;
  day: string;
  count: number;
}

export interface FilterOptions {
  selectedDate: string;
  dateRange: { from: Date; to: Date };
  datePreset: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisWeek' | 'thisMonth' | 'lastWeek' | 'lastMonth' | 'custom';
  userFilter: string;
  categoryFilter: string;
  browserFilter: string;
  timeOfDayFilter: string;
  socialMediaOnly: boolean;
  searchTerm: string;
  viewMode: 'list' | 'sessions';
  groupBy: 'none' | 'user' | 'domain' | 'category';
}

export type CategoryType = 
  | 'Work' 
  | 'Social Media' 
  | 'Entertainment' 
  | 'Development' 
  | 'Communication' 
  | 'Search'
  | 'Productivity'
  | 'News'
  | 'Shopping'
  | 'Other';

export type TimeOfDay = 'all' | 'morning' | 'afternoon' | 'evening' | 'night';

