/**
 * CompactEmployeeCard Component
 * 
 * A compact, single-row card for displaying employee AI insights at a glance.
 * Shows productivity score, performance badge, risk level, and brief summary.
 * Click "More Details" to see comprehensive analysis.
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  User, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  Clock,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ShieldAlert
} from 'lucide-react';

// Types
export type PerformanceStatus = 'excellent' | 'good' | 'needs_improvement' | 'concerning' | 'pending';

export interface AIInsight {
  id: string;
  user_id: string;
  period_type: 'today' | 'week' | 'month';
  period_start: string;
  period_end: string;
  total_hours: number;
  activity_percentage: number;
  productivity_score: number;
  screenshots_analyzed: number;
  risk_level: 'low' | 'medium' | 'high';
  ai_insights: any;
  productivity_indicators: any;
  distraction_indicators: any;
  behavioral_patterns: any;
  analysis_version: string;
  computed_at: string;
  updated_at: string;
  users?: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    organization_id?: string;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
  };
}

interface CompactEmployeeCardProps {
  insight: AIInsight;
  historicalCount: number;
  teamAverage: number;
  screenshotCount?: number;
  issuesCount?: number;
  issueLabels?: string[]; // Descriptions of each detected issue
  onMoreDetails: () => void;
}

// Helper functions
export const getPerformanceStatus = (insight: AIInsight): PerformanceStatus => {
  const isPending = insight.analysis_version === 'pending' || (insight.ai_insights as any)?.pending_analysis;
  
  // If pending but has calculated scores (basic analysis), use those scores instead of showing "Pending"
  if (isPending && insight.productivity_score > 0) {
    const score = insight.productivity_score;
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'needs_improvement';
    return 'concerning';
  }
  
  // Truly pending with no data
  if (isPending) {
    return 'pending';
  }
  
  const productivityScore = insight.productivity_score || 0;
  const riskLevel = insight.risk_level || 'low';
  const distractionScore = insight.distraction_indicators?.distraction_score || 0;
  
  if (riskLevel === 'high' || productivityScore < 40 || distractionScore > 60) {
    return 'concerning';
  }
  if (riskLevel === 'medium' || productivityScore < 60) {
    return 'needs_improvement';
  }
  if (productivityScore >= 80 && riskLevel === 'low') {
    return 'excellent';
  }
  return 'good';
};

export const getPerformanceStatusBadge = (status: PerformanceStatus) => {
  switch (status) {
    case 'excellent':
      return { className: 'bg-green-100 text-green-800 border-green-200', label: 'Excellent', icon: TrendingUp };
    case 'good':
      return { className: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Good', icon: CheckCircle };
    case 'needs_improvement':
      return { className: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Needs Improvement', icon: AlertTriangle };
    case 'concerning':
      return { className: 'bg-red-100 text-red-800 border-red-200', label: 'Concerning', icon: AlertCircle };
    case 'pending':
      return { className: 'bg-purple-100 text-purple-800 border-purple-200', label: 'Pending Analysis', icon: Clock };
  }
};

const getRiskBadgeColor = (risk: string) => {
  switch (risk) {
    case 'low': return 'bg-green-100 text-green-800';
    case 'medium': return 'bg-yellow-100 text-yellow-800';
    case 'high': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getProductivityColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
};

const getProgressBarColor = (score: number) => {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
};

const safeRenderValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  if (Array.isArray(value)) return value.map(v => safeRenderValue(v)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

export function CompactEmployeeCard({
  insight,
  historicalCount,
  teamAverage,
  screenshotCount,
  issuesCount = 0,
  issueLabels = [],
  onMoreDetails
}: CompactEmployeeCardProps) {
  const performanceStatus = getPerformanceStatus(insight);
  const statusBadge = getPerformanceStatusBadge(performanceStatus);
  const StatusIcon = statusBadge.icon;
  const vsTeam = insight.productivity_score - teamAverage;
  
  const displayScreenshots = screenshotCount ?? insight.screenshots_analyzed;
  const displayHours = insight.total_hours > 0 ? `${insight.total_hours} hours` : 'less than 1 hour';
  const isPendingWithData = (insight.analysis_version === 'pending' || insight.ai_insights?.pending_analysis) && insight.productivity_score > 0;

  // Build a meaningful description from available AI data
  const workDesc = safeRenderValue(insight.ai_insights?.work_description || '');
  const rawSummary = safeRenderValue(insight.ai_insights?.executive_summary || '');
  const topAppsStr = safeRenderValue(insight.behavioral_patterns?.top_apps || '');
  const aiSuggestions = insight.ai_insights?.ai_suggestions;
  const name = insight.users?.full_name?.split(' ')[0] || 'Employee';
  
  let executiveSummary = rawSummary;
  const lowerSummary = rawSummary.toLowerCase();
  const isGenericSummary = lowerSummary.includes('productivity score of 100') ||
    lowerSummary.includes('100% productivity score') ||
    lowerSummary.includes('perfect productivity score') ||
    lowerSummary.includes('exceptional performance') ||
    (lowerSummary.includes('excellent performance') && lowerSummary.includes('100%')) ||
    (lowerSummary.includes('exceptionally well') && lowerSummary.includes('100%'));
  
  // Only replace generic summary if the fallback provides real analysis, not just app lists
  const isAppListOnly = (text: string) => {
    const lower = text.toLowerCase();
    return lower.startsWith('working with ') || 
      (lower.includes('primarily using') && !lower.includes('focused on')) ||
      (lower.includes('primarily using') && lower.split('.').length <= 2);
  };
  
  if (isGenericSummary) {
    // Try work_description first — but only if it's actual analysis, not app listing
    if (workDesc && !isAppListOnly(workDesc) && workDesc !== 'Working with various applications') {
      executiveSummary = workDesc;
    } else {
      // Compose a meaningful summary from actual data — avoid generic positive language
      const hours = insight.total_hours > 0 ? `${insight.total_hours} hours` : 'the session';
      const actPct = Math.round(insight.activity_percentage);
      const prodPct = insight.productivity_score;
      const topApps = topAppsStr || (insight.behavioral_patterns?.top_apps ? safeRenderValue(insight.behavioral_patterns.top_apps) : '');
      
      const parts: string[] = [];
      if (topApps) {
        parts.push(`${name} primarily used ${topApps} over ${hours}`);
      }
      // Describe productivity accurately based on score, don't always say "highly focused"
      if (prodPct >= 80 && actPct >= 70 && issuesCount === 0) {
        parts.push('Highly focused and productive session');
      } else if (prodPct >= 60 && actPct >= 50) {
        parts.push(`${actPct}% keyboard/mouse activity detected`);
      } else if (actPct > 0) {
        parts.push(`${actPct}% keyboard/mouse activity — below average engagement`);
      }
      if (displayScreenshots > 0) {
        parts.push(`${displayScreenshots} screenshots captured`);
      }
      executiveSummary = parts.length > 0 ? parts.join('. ') + '.' : rawSummary;
    }
  }
  
  return (
    <Card 
      className={`p-4 transition-all hover:shadow-md ${
        performanceStatus === 'concerning' ? 'border-l-4 border-l-red-500 bg-red-50/30' :
        performanceStatus === 'needs_improvement' ? 'border-l-4 border-l-yellow-500 bg-yellow-50/30' :
        performanceStatus === 'excellent' ? 'border-l-4 border-l-green-500 bg-green-50/30' :
        'border-l-4 border-l-blue-500'
      }`}
    >
      {/* Row 1: Main info */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Avatar + Name */}
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            performanceStatus === 'concerning' ? 'bg-red-100' :
            performanceStatus === 'needs_improvement' ? 'bg-yellow-100' :
            performanceStatus === 'excellent' ? 'bg-green-100' :
            'bg-blue-100'
          }`}>
            <User className={`h-5 w-5 ${
              performanceStatus === 'concerning' ? 'text-red-600' :
              performanceStatus === 'needs_improvement' ? 'text-yellow-600' :
              performanceStatus === 'excellent' ? 'text-green-600' :
              'text-blue-600'
            }`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 truncate">
                {insight.users?.full_name || 'Unknown User'}
              </span>
              {historicalCount > 0 && (
                <Badge variant="secondary" className="text-xs font-normal flex-shrink-0">
                  +{historicalCount} history
                </Badge>
              )}
            </div>
            <span className="text-xs text-gray-500">{insight.users?.email} • {insight.users?.role}</span>
          </div>
        </div>

        {/* Center: Progress bar */}
        <div className="flex-1 hidden md:block max-w-md">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Productivity</span>
            <span className="text-muted-foreground">Team Avg: {teamAverage}%</span>
          </div>
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${getProgressBarColor(insight.productivity_score)}`}
              style={{ width: `${insight.productivity_score}%` }}
            />
            {/* Team average marker */}
            <div 
              className="absolute top-0 w-0.5 h-full bg-gray-800"
              style={{ left: `${teamAverage}%` }}
            />
          </div>
        </div>

        {/* Right: Score + Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Issues Badge - show what the issue is and click opens details */}
          {issuesCount > 0 && (
            <Badge 
              variant="outline" 
              className="bg-orange-100 text-orange-800 border-orange-300 flex items-center gap-1 cursor-pointer hover:bg-orange-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onMoreDetails(); // Opens details modal where Issues tab shows full breakdown
              }}
              title={issueLabels.length > 0 ? issueLabels.join(', ') : 'Click to view issue details'}
            >
              <ShieldAlert className="h-3 w-3" />
              {issueLabels.length > 0 ? issueLabels[0] : `${issuesCount} issue${issuesCount > 1 ? 's' : ''}`}
            </Badge>
          )}
          
          {/* Performance Badge */}
          <Badge variant="outline" className={`${statusBadge.className} hidden sm:flex items-center gap-1`}>
            <StatusIcon className="h-3 w-3" />
            {statusBadge.label}
          </Badge>
          
          {/* Risk Badge - Only show for medium/high risk to avoid "Excellent + LOW" confusion */}
          {insight.risk_level !== 'low' && (
            <Badge className={`${getRiskBadgeColor(insight.risk_level)} hidden lg:inline-flex`}>
              {insight.risk_level.toUpperCase()}
            </Badge>
          )}
          
          {/* Productivity Score */}
          <div className="text-right min-w-[60px]">
            <div className={`text-2xl font-bold ${getProductivityColor(insight.productivity_score)}`}>
              {insight.productivity_score}%
            </div>
            <div className={`text-xs flex items-center justify-end gap-0.5 ${
              vsTeam > 0 ? 'text-green-600' : vsTeam < 0 ? 'text-red-600' : 'text-gray-500'
            }`}>
              {vsTeam > 0 ? (
                <><ArrowUpRight className="h-3 w-3" />+{vsTeam}%</>
              ) : vsTeam < 0 ? (
                <><ArrowDownRight className="h-3 w-3" />{vsTeam}%</>
              ) : (
                <><Minus className="h-3 w-3" />avg</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Summary */}
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Activity:</span>{' '}
            {displayScreenshots} screenshots over {displayHours}
            {displayScreenshots > 0 && (
              <span className={`ml-1 font-medium ${insight.activity_percentage >= 60 ? 'text-green-600' : insight.activity_percentage >= 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                • {Math.round(insight.activity_percentage)}% active
              </span>
            )}
            {isPendingWithData && (
              <span className="ml-1 text-xs text-purple-600 font-medium">(Basic analysis)</span>
            )}
          </div>
          {/* Risk penalty explanation for suspicious patterns */}
          {insight.risk_level === 'high' && insight.activity_percentage >= 90 && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium">Score penalized</span> — {Math.round(insight.activity_percentage)}% activity is suspiciously uniform, likely mouse jiggler or automation
            </p>
          )}
          {insight.risk_level === 'high' && insight.activity_percentage < 90 && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium">Score penalized</span> — suspicious activity patterns detected
            </p>
          )}
          {insight.risk_level === 'medium' && insight.productivity_score < 85 && (
            <p className="text-xs text-yellow-700 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium">Moderate risk</span> — some irregular activity patterns detected
            </p>
          )}
          {executiveSummary && insight.risk_level !== 'high' && (
            <p className="text-sm text-gray-700 mt-1">
              {executiveSummary}
            </p>
          )}
          {executiveSummary && insight.risk_level === 'high' && (
            <p className="text-sm text-gray-500 mt-0.5 italic">
              {executiveSummary}
            </p>
          )}
        </div>
        
        {/* Action button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
            onClick={(e) => {
              e.stopPropagation();
              onMoreDetails();
            }}
          >
            <ChevronRight className="h-3 w-3 mr-1" />
            More Details
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default CompactEmployeeCard;
