// Issues By Date Breakdown Component
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  CalendarDays, 
  ChevronDown,
  ChevronUp,
  Copy,
  TrendingDown,
  Smartphone,
  Globe,
  Play,
  Gamepad2,
  Clock,
  AlertTriangle,
  User,
  Eye,
  Calendar,
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  isToday, 
  isYesterday, 
  startOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  endOfDay,
  isWithinInterval 
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { DetectedIssue, IssueType, IssueSeverity } from '../types';
import { ISSUE_CATEGORIES, SEVERITY_COLORS } from '../constants';

type DateFilterPeriod = 'today' | 'week' | 'month' | 'all';

interface IssuesByDateBreakdownProps {
  issues: DetectedIssue[];
  loading?: boolean;
  onSelectDate?: (date: string) => void;
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

interface DateGroup {
  date: string;
  displayDate: string;
  issues: DetectedIssue[];
  totalIssues: number;
  issuesByType: Record<IssueType, number>;
  issuesBySeverity: Record<IssueSeverity, number>;
  affectedEmployees: Set<string>;
  averageRiskScore: number;
}

// Format date for display
function formatDateLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMM dd');
}

// Issue type mini badges
function IssueTypeBadges({ issuesByType }: { issuesByType: Record<IssueType, number> }) {
  const activeTypes = (Object.entries(issuesByType) as [IssueType, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (activeTypes.length === 0) {
    return <span className="text-muted-foreground text-xs">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {activeTypes.slice(0, 4).map(([type, count]) => {
        const Icon = ISSUE_ICONS[type];
        const category = ISSUE_CATEGORIES[type];
        
        return (
          <div
            key={type}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${category.bgColor} ${category.color}`}
            title={`${category.label}: ${count}`}
          >
            <Icon className="h-3 w-3" />
            <span>{count}</span>
          </div>
        );
      })}
      {activeTypes.length > 4 && (
        <span className="text-xs text-muted-foreground">+{activeTypes.length - 4}</span>
      )}
    </div>
  );
}

// Severity distribution mini bar
function SeverityBar({ issuesBySeverity, total }: { issuesBySeverity: Record<IssueSeverity, number>; total: number }) {
  if (total === 0) return null;
  
  const criticalPct = (issuesBySeverity.critical / total) * 100;
  const highPct = (issuesBySeverity.high / total) * 100;
  const mediumPct = (issuesBySeverity.medium / total) * 100;
  const lowPct = (issuesBySeverity.low / total) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-24 rounded-full overflow-hidden bg-gray-100">
        {criticalPct > 0 && (
          <div className="bg-red-500 h-full" style={{ width: `${criticalPct}%` }} title={`Critical: ${issuesBySeverity.critical}`} />
        )}
        {highPct > 0 && (
          <div className="bg-orange-500 h-full" style={{ width: `${highPct}%` }} title={`High: ${issuesBySeverity.high}`} />
        )}
        {mediumPct > 0 && (
          <div className="bg-yellow-500 h-full" style={{ width: `${mediumPct}%` }} title={`Medium: ${issuesBySeverity.medium}`} />
        )}
        {lowPct > 0 && (
          <div className="bg-green-500 h-full" style={{ width: `${lowPct}%` }} title={`Low: ${issuesBySeverity.low}`} />
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {issuesBySeverity.critical > 0 && <span className="text-red-600 font-medium">{issuesBySeverity.critical}C </span>}
        {issuesBySeverity.high > 0 && <span className="text-orange-600">{issuesBySeverity.high}H </span>}
        {issuesBySeverity.medium > 0 && <span className="text-yellow-600">{issuesBySeverity.medium}M</span>}
      </span>
    </div>
  );
}

// Expandable issue row for a single date
function DateIssueRow({ dateGroup, expanded, onToggle }: { 
  dateGroup: DateGroup; 
  expanded: boolean; 
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  
  const rowColorClass = dateGroup.issuesBySeverity.critical > 0 
    ? 'bg-red-50/30' 
    : dateGroup.issuesBySeverity.high > 0 
      ? 'bg-orange-50/30' 
      : '';

  return (
    <>
      <TableRow 
        className={`cursor-pointer hover:bg-gray-50 ${rowColorClass}`}
        onClick={onToggle}
      >
        <TableCell>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              dateGroup.issuesBySeverity.critical > 0 ? 'bg-red-100' :
              dateGroup.issuesBySeverity.high > 0 ? 'bg-orange-100' :
              'bg-blue-100'
            }`}>
              <CalendarDays className={`h-5 w-5 ${
                dateGroup.issuesBySeverity.critical > 0 ? 'text-red-600' :
                dateGroup.issuesBySeverity.high > 0 ? 'text-orange-600' :
                'text-blue-600'
              }`} />
            </div>
            <div>
              <p className="font-medium text-sm">{dateGroup.displayDate}</p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(dateGroup.date), 'yyyy-MM-dd')}
              </p>
            </div>
          </div>
        </TableCell>
        
        <TableCell className="text-center">
          <span className={`text-lg font-bold ${
            dateGroup.totalIssues >= 10 ? 'text-red-600' :
            dateGroup.totalIssues >= 5 ? 'text-orange-600' :
            'text-gray-900'
          }`}>
            {dateGroup.totalIssues}
          </span>
        </TableCell>
        
        <TableCell>
          <IssueTypeBadges issuesByType={dateGroup.issuesByType} />
        </TableCell>
        
        <TableCell>
          <SeverityBar issuesBySeverity={dateGroup.issuesBySeverity} total={dateGroup.totalIssues} />
        </TableCell>
        
        <TableCell className="text-center">
          <Badge variant="outline" className="text-xs">
            <User className="h-3 w-3 mr-1" />
            {dateGroup.affectedEmployees.size}
          </Badge>
        </TableCell>
        
        <TableCell className="text-right">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
      </TableRow>
      
      {/* Expanded details */}
      {expanded && (
        <TableRow className="bg-gray-50/50">
          <TableCell colSpan={6} className="p-0">
            <div className="px-4 py-3 space-y-3">
              {/* Mini issue cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {dateGroup.issues.slice(0, 6).map(issue => {
                  const Icon = ISSUE_ICONS[issue.type];
                  const category = ISSUE_CATEGORIES[issue.type];
                  const severityColor = SEVERITY_COLORS[issue.severity];
                  
                  return (
                    <div
                      key={issue.id}
                      className={`p-3 rounded-lg border ${category.borderColor} ${category.bgColor}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${category.color}`} />
                          <span className={`text-xs font-medium ${category.color}`}>
                            {category.label}
                          </span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] ${severityColor.bg} ${severityColor.text} ${severityColor.border}`}
                        >
                          {issue.severity}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            {issue.userName}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(issue.detectedAt), 'HH:mm')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {issue.details.description}
                      </p>
                    </div>
                  );
                })}
              </div>
              
              {dateGroup.issues.length > 6 && (
                <p className="text-xs text-muted-foreground text-center">
                  + {dateGroup.issues.length - 6} more issues on this day
                </p>
              )}
              
              {/* Quick stats for this date */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-gray-900">{dateGroup.affectedEmployees.size}</strong> employees affected
                  </span>
                  <span>•</span>
                  <span>
                    Most common: <strong className="text-gray-900">
                      {ISSUE_CATEGORIES[
                        (Object.entries(dateGroup.issuesByType) as [IssueType, number][])
                          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'duplicate_screenshots'
                      ].label}
                    </strong>
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/screenshots?date=${dateGroup.date}`);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Screenshots
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function IssuesByDateBreakdown({ 
  issues, 
  loading,
  onSelectDate 
}: IssuesByDateBreakdownProps) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<DateFilterPeriod>('all');

  // Get date range based on filter
  const getDateRange = (filter: DateFilterPeriod): { start: Date; end: Date } | null => {
    const now = new Date();
    switch (filter) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'all':
      default:
        return null;
    }
  };

  // Filter issues based on selected period
  const filteredIssues = useMemo(() => {
    const range = getDateRange(dateFilter);
    if (!range) return issues;
    
    return issues.filter(issue => {
      const issueDate = parseISO(issue.detectedAt);
      return isWithinInterval(issueDate, { start: range.start, end: range.end });
    });
  }, [issues, dateFilter]);

  // Group issues by date
  const dateGroups = useMemo((): DateGroup[] => {
    const groupMap = new Map<string, DateGroup>();
    
    filteredIssues.forEach(issue => {
      const dateKey = format(startOfDay(parseISO(issue.detectedAt)), 'yyyy-MM-dd');
      
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, {
          date: dateKey,
          displayDate: formatDateLabel(dateKey),
          issues: [],
          totalIssues: 0,
          issuesByType: {
            duplicate_screenshots: 0,
            low_activity: 0,
            social_media_app: 0,
            social_media_url: 0,
            entertainment: 0,
            gaming: 0,
            excessive_idle: 0,
          },
          issuesBySeverity: {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
          },
          affectedEmployees: new Set(),
          averageRiskScore: 0,
        });
      }
      
      const group = groupMap.get(dateKey)!;
      group.issues.push(issue);
      group.totalIssues++;
      group.issuesByType[issue.type]++;
      group.issuesBySeverity[issue.severity]++;
      group.affectedEmployees.add(issue.userId);
    });
    
    // Sort by date descending (most recent first)
    return Array.from(groupMap.values()).sort((a, b) => 
      b.date.localeCompare(a.date)
    );
  }, [filteredIssues]);

  const toggleExpanded = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading date data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (dateGroups.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="py-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CalendarDays className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-base font-semibold text-green-900 mb-1">All Clear</h3>
            <p className="text-green-700 text-sm">
              No activity issues detected in this period.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate summary stats
  const totalDaysWithIssues = dateGroups.length;
  const avgIssuesPerDay = totalDaysWithIssues > 0 ? Math.round(filteredIssues.length / totalDaysWithIssues) : 0;
  const sortedByIssues = [...dateGroups].sort((a, b) => b.totalIssues - a.totalIssues);
  const peakDay = sortedByIssues[0];

  // Get period label
  const getPeriodLabel = () => {
    switch (dateFilter) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      default: return 'All Time';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              Issues by Date
            </CardTitle>
            <CardDescription className="mt-1">
              {totalDaysWithIssues > 0 ? (
                <>
                  {totalDaysWithIssues} day{totalDaysWithIssues !== 1 ? 's' : ''} with issues • 
                  Average {avgIssuesPerDay} issues/day
                  {peakDay && <> • Peak: {peakDay.displayDate} ({peakDay.totalIssues} issues)</>}
                </>
              ) : (
                'No issues in selected period'
              )}
            </CardDescription>
          </div>
          
          {/* Date Filter Buttons */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <Button
              size="sm"
              variant={dateFilter === 'today' ? 'default' : 'ghost'}
              className={`h-8 px-3 text-xs ${dateFilter === 'today' ? '' : 'hover:bg-gray-200'}`}
              onClick={() => setDateFilter('today')}
            >
              <Calendar className="h-3 w-3 mr-1.5" />
              Today
            </Button>
            <Button
              size="sm"
              variant={dateFilter === 'week' ? 'default' : 'ghost'}
              className={`h-8 px-3 text-xs ${dateFilter === 'week' ? '' : 'hover:bg-gray-200'}`}
              onClick={() => setDateFilter('week')}
            >
              This Week
            </Button>
            <Button
              size="sm"
              variant={dateFilter === 'month' ? 'default' : 'ghost'}
              className={`h-8 px-3 text-xs ${dateFilter === 'month' ? '' : 'hover:bg-gray-200'}`}
              onClick={() => setDateFilter('month')}
            >
              This Month
            </Button>
            <Button
              size="sm"
              variant={dateFilter === 'all' ? 'default' : 'ghost'}
              className={`h-8 px-3 text-xs ${dateFilter === 'all' ? '' : 'hover:bg-gray-200'}`}
              onClick={() => setDateFilter('all')}
            >
              All
            </Button>
          </div>
        </div>
        
        {/* Active filter badge */}
        {dateFilter !== 'all' && (
          <div className="mt-3">
            <Badge variant="secondary" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              Showing: {getPeriodLabel()}
              <button 
                className="ml-1.5 hover:text-red-600"
                onClick={() => setDateFilter('all')}
              >
                ×
              </button>
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Date</TableHead>
                <TableHead className="text-center w-[80px]">Issues</TableHead>
                <TableHead>Issue Types</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-center w-[100px]">Employees</TableHead>
                <TableHead className="text-right w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateGroups.map((dateGroup) => (
                <DateIssueRow
                  key={dateGroup.date}
                  dateGroup={dateGroup}
                  expanded={expandedDates.has(dateGroup.date)}
                  onToggle={() => toggleExpanded(dateGroup.date)}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats at Bottom */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">
                Critical Days: {dateGroups.filter(d => d.issuesBySeverity.critical > 0).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-muted-foreground">
                High Issue Days: {dateGroups.filter(d => d.issuesBySeverity.high > 0).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">
                Clean Days: {dateGroups.filter(d => d.totalIssues === 0).length}
              </span>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Total: {filteredIssues.length} issues across {totalDaysWithIssues} days
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
