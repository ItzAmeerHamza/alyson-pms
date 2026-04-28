// Issue Summary Cards Component
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Brain,
  Copy,
  Smartphone,
  Globe,
  Play,
  Gamepad2,
  Clock,
} from 'lucide-react';
import { IssueSummaryStats, IssueType } from '../types';
import { ISSUE_CATEGORIES, SEVERITY_COLORS } from '../constants';

interface IssueSummaryCardsProps {
  stats: IssueSummaryStats;
  loading?: boolean;
}

// Map issue types to icons
const ISSUE_ICONS: Record<IssueType, React.ElementType> = {
  duplicate_screenshots: Copy,
  low_activity: TrendingDown,
  social_media_app: Smartphone,
  social_media_url: Globe,
  entertainment: Play,
  gaming: Gamepad2,
  excessive_idle: Clock,
};

export function IssueSummaryCards({ stats, loading }: IssueSummaryCardsProps) {
  const trendIcon = stats.trendVsPrevious > 0 
    ? <TrendingUp className="h-4 w-4 text-red-500" />
    : stats.trendVsPrevious < 0 
      ? <TrendingDown className="h-4 w-4 text-green-500" />
      : <Minus className="h-4 w-4 text-gray-400" />;

  const trendLabel = stats.trendVsPrevious > 0 
    ? `+${stats.trendVsPrevious}% vs previous` 
    : stats.trendVsPrevious < 0 
      ? `${stats.trendVsPrevious}% vs previous`
      : 'No change';

  const MostCommonIcon = stats.mostCommonIssue 
    ? ISSUE_ICONS[stats.mostCommonIssue] 
    : AlertTriangle;

  const mostCommonCategory = stats.mostCommonIssue 
    ? ISSUE_CATEGORIES[stats.mostCommonIssue]
    : null;

  // Calculate severity distribution for mini chart
  const totalBySeverity = Object.values(stats.issuesBySeverity).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Issues Card */}
      <Card className={`${stats.totalIssues > 0 ? 'border-red-200 bg-red-50/30' : 'border-green-200 bg-green-50/30'}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Issues</p>
              <p className={`text-3xl font-bold mt-1 ${stats.totalIssues > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {loading ? '...' : stats.totalIssues}
              </p>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                {trendIcon}
                <span>{trendLabel}</span>
              </div>
            </div>
            <div className={`p-3 rounded-lg ${stats.totalIssues > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
              <AlertTriangle className={`h-6 w-6 ${stats.totalIssues > 0 ? 'text-red-600' : 'text-green-600'}`} />
            </div>
          </div>
          
          {/* Severity mini breakdown */}
          {totalBySeverity > 0 && (
            <div className="mt-4 flex gap-1">
              {stats.issuesBySeverity.critical > 0 && (
                <div 
                  className="h-2 bg-red-500 rounded-full" 
                  style={{ width: `${(stats.issuesBySeverity.critical / totalBySeverity) * 100}%` }}
                  title={`${stats.issuesBySeverity.critical} critical`}
                />
              )}
              {stats.issuesBySeverity.high > 0 && (
                <div 
                  className="h-2 bg-orange-500 rounded-full" 
                  style={{ width: `${(stats.issuesBySeverity.high / totalBySeverity) * 100}%` }}
                  title={`${stats.issuesBySeverity.high} high`}
                />
              )}
              {stats.issuesBySeverity.medium > 0 && (
                <div 
                  className="h-2 bg-yellow-500 rounded-full" 
                  style={{ width: `${(stats.issuesBySeverity.medium / totalBySeverity) * 100}%` }}
                  title={`${stats.issuesBySeverity.medium} medium`}
                />
              )}
              {stats.issuesBySeverity.low > 0 && (
                <div 
                  className="h-2 bg-green-500 rounded-full" 
                  style={{ width: `${(stats.issuesBySeverity.low / totalBySeverity) * 100}%` }}
                  title={`${stats.issuesBySeverity.low} low`}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employees Affected Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Employees Affected</p>
              <p className="text-3xl font-bold mt-1 text-gray-900">
                {loading ? '...' : stats.employeesAffected}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                With at least one issue
              </p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Most Common Issue Card */}
      <Card className={mostCommonCategory ? mostCommonCategory.bgColor : ''}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Most Common Issue</p>
              <p className={`text-lg font-bold mt-1 ${mostCommonCategory?.color || 'text-gray-600'}`}>
                {loading ? '...' : mostCommonCategory?.label || 'None'}
              </p>
              {stats.mostCommonIssue && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {stats.issuesByType[stats.mostCommonIssue]} occurrences
                  </Badge>
                </div>
              )}
            </div>
            <div className={`p-3 rounded-lg ${mostCommonCategory?.bgColor || 'bg-gray-100'}`}>
              <MostCommonIcon className={`h-6 w-6 ${mostCommonCategory?.color || 'text-gray-600'}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Risk Score Card */}
      <Card className={`${stats.averageRiskScore > 50 ? 'border-orange-200 bg-orange-50/30' : 'border-blue-200 bg-blue-50/30'}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">AI Risk Score</p>
              <p className={`text-3xl font-bold mt-1 ${
                stats.averageRiskScore > 70 ? 'text-red-600' :
                stats.averageRiskScore > 50 ? 'text-orange-600' :
                stats.averageRiskScore > 30 ? 'text-yellow-600' :
                'text-green-600'
              }`}>
                {loading ? '...' : stats.averageRiskScore}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Average across affected employees
              </p>
            </div>
            <div className="p-3 rounded-lg bg-purple-100">
              <Brain className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          
          {/* Risk gauge */}
          <div className="mt-4">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  stats.averageRiskScore > 70 ? 'bg-red-500' :
                  stats.averageRiskScore > 50 ? 'bg-orange-500' :
                  stats.averageRiskScore > 30 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${stats.averageRiskScore}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

