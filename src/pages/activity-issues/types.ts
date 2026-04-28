// Activity Issues Types

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueType = 
  | 'duplicate_screenshots'
  | 'low_activity'
  | 'social_media_app'
  | 'social_media_url'
  | 'entertainment'
  | 'gaming'
  | 'excessive_idle';

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'last-month' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface IssueCategory {
  type: IssueType;
  label: string;
  description: string;
  severity: IssueSeverity;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export interface DetectedIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  userId: string;
  userName: string;
  userEmail: string;
  detectedAt: string;
  count: number;
  details: IssueDetails;
  screenshots?: IssueScreenshot[];
  aiRecommendation?: string;
}

export interface IssueDetails {
  description: string;
  duration?: number;
  appNames?: string[];
  domains?: string[];
  activityPercent?: number;
  duplicateGroupHash?: string;
  consecutiveCount?: number;
}

export interface IssueScreenshot {
  id: string;
  imageUrl: string;
  capturedAt: string;
  activityPercent: number;
  appName?: string;
  url?: string;
}

export interface EmployeeIssuesSummary {
  userId: string;
  userName: string;
  userEmail: string;
  totalIssues: number;
  issuesByType: Record<IssueType, number>;
  riskScore: number;
  trend: 'improving' | 'stable' | 'declining';
  lastIssueAt?: string;
}

export interface IssueSummaryStats {
  totalIssues: number;
  employeesAffected: number;
  mostCommonIssue: IssueType | null;
  averageRiskScore: number;
  issuesByType: Record<IssueType, number>;
  issuesBySeverity: Record<IssueSeverity, number>;
  trendVsPrevious: number;
}

export interface FilterOptions {
  period: PeriodType;
  dateRange: DateRange;
  userFilter: string;
  issueTypeFilter: IssueType | 'all';
  severityFilter: IssueSeverity | 'all';
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: string;
}

