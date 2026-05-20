// Activity Issues Page - Main Component
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/providers/auth-provider';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from 'date-fns';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { 
  AlertTriangle, 
  RefreshCw, 
  Filter, 
  Calendar,
  CalendarDays,
  Shield,
  Brain,
  Users,
  Copy,
  Smartphone,
  Globe,
  Play,
  Gamepad2,
  Clock,
  TrendingDown,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

// Import our custom components
import { IssueSummaryCards } from './components/issue-summary-cards';
import { IssueList } from './components/issue-list';
import { EmployeeIssuesBreakdown } from './components/employee-issues-breakdown';
import { IssuesByDateBreakdown } from './components/issues-by-date-breakdown';
import { IssueCharts } from './components/issue-charts';
import { VisionAnalysisPanel } from '@/components/admin/VisionAnalysisPanel';
import { useActivityIssues } from './hooks/use-activity-issues';
import { ISSUE_CATEGORIES, PERIOD_LABELS, SEVERITY_COLORS } from './constants';
import { IssueType, IssueSeverity, PeriodType } from './types';
import { exportIssuesToCSV, exportEmployeeSummariesToCSV, exportFullReport } from './utils/export';
import { generateExecutiveSummary } from './utils/ai-recommendations';

// Issue type icons for filter
const ISSUE_TYPE_ICONS: Record<IssueType, React.ElementType> = {
  duplicate_screenshots: Copy,
  low_activity: TrendingDown,
  social_media_app: Smartphone,
  social_media_url: Globe,
  entertainment: Play,
  gaming: Gamepad2,
  excessive_idle: Clock,
};

export default function ActivityIssuesPage() {
  const { userDetails } = useAuth();
  const isAdmin = userDetails?.role === 'admin';
  
  const {
    issues,
    employeeSummaries,
    stats,
    users,
    loading,
    error,
    filters,
    setFilters,
    refresh,
  } = useActivityIssues(isAdmin);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'issues' | 'employees' | 'dates'>('issues');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      toast.success('Data refreshed successfully');
    } catch (err) {
      toast.error('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const handlePeriodChange = (period: string) => {
    if (period === 'custom') {
      setCustomPickerOpen(true);
      setFilters({ period: period as PeriodType });
    } else {
      setFilters({ period: period as PeriodType });
    }
  };

  const handleCustomDateApply = (start: Date, end: Date) => {
    setFilters({ period: 'custom' as PeriodType, dateRange: { start: startOfDay(start), end: endOfDay(end) } });
  };

  // Apply custom dates when both are picked
  React.useEffect(() => {
    if (filters.period === 'custom' && customStartDate && customEndDate) {
      handleCustomDateApply(customStartDate, customEndDate);
    }
  }, [customStartDate, customEndDate]);

  // Handle user filter change
  const handleUserChange = (userId: string) => {
    setFilters({ userFilter: userId });
  };

  // Handle issue type filter change
  const handleIssueTypeChange = (type: string) => {
    setFilters({ issueTypeFilter: type as IssueType | 'all' });
  };

  // Handle severity filter change
  const handleSeverityChange = (severity: string) => {
    setFilters({ severityFilter: severity as IssueSeverity | 'all' });
  };

  // Handle employee selection to filter issues
  const handleSelectEmployee = (userId: string) => {
    setFilters({ userFilter: userId });
    setActiveTab('issues');
  };

  // Generate period label
  const getPeriodLabel = () => {
    const { start, end } = filters.dateRange;
    return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
  };

  // Access check
  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-96">
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Access Required</h3>
              <p className="text-gray-600">You need admin privileges to access activity issues.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
            Activity Issues
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered detection of employee productivity concerns and behavioral patterns
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector */}
          <Select value={filters.period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Today</SelectItem>
              <SelectItem value="weekly">This Week</SelectItem>
              <SelectItem value="monthly">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="custom">Custom Dates</SelectItem>
            </SelectContent>
          </Select>
          {filters.period === 'custom' && (
            <Popover open={customPickerOpen} onOpenChange={setCustomPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {customStartDate && customEndDate
                    ? `${format(customStartDate, 'MMM d')} - ${format(customEndDate, 'MMM d, yyyy')}`
                    : 'Pick dates'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="start">
                <div className="flex gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Start Date</Label>
                    <CalendarPicker mode="single" selected={customStartDate} onSelect={(date) => { setCustomStartDate(date); if (date && customEndDate && date > customEndDate) setCustomEndDate(undefined); }} initialFocus />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">End Date</Label>
                    <CalendarPicker mode="single" selected={customEndDate} onSelect={(date) => { setCustomEndDate(date); if (date && customStartDate) setCustomPickerOpen(false); }} disabled={(date) => customStartDate ? date < customStartDate : false} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          {/* User Filter */}
          <EmployeeFilterCombobox
            value={filters.userFilter}
            onValueChange={handleUserChange}
            users={users}
            allLabel="All Employees"
            className="w-[180px]"
          />

          {/* Issue Type Filter */}
          <Select value={filters.issueTypeFilter} onValueChange={handleIssueTypeChange}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Issue Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Issue Types</SelectItem>
              {(Object.entries(ISSUE_CATEGORIES) as [IssueType, typeof ISSUE_CATEGORIES[IssueType]][]).map(([type, category]) => {
                const Icon = ISSUE_TYPE_ICONS[type];
                return (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${category.color}`} />
                      {category.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Severity Filter */}
          <Select value={filters.severityFilter} onValueChange={handleSeverityChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="critical">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Critical
                </span>
              </SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  High
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  Medium
                </span>
              </SelectItem>
              <SelectItem value="low">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Low
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          
          {/* Refresh Button */}
          <Button 
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Export Dropdown */}
          <Select onValueChange={(value) => {
            if (value === 'issues-csv') {
              exportIssuesToCSV(issues);
              toast.success('Issues exported to CSV');
            } else if (value === 'employees-csv') {
              exportEmployeeSummariesToCSV(employeeSummaries);
              toast.success('Employee summary exported to CSV');
            } else if (value === 'full-report') {
              exportFullReport(stats, issues, employeeSummaries, filters.dateRange);
              toast.success('Full report exported');
            }
          }}>
            <SelectTrigger className="w-[130px]">
              <Download className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Export" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="issues-csv">Issues (CSV)</SelectItem>
              <SelectItem value="employees-csv">Employees (CSV)</SelectItem>
              <SelectItem value="full-report">Full Report</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Period Info Badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-sm">
          <Calendar className="h-3 w-3 mr-1" />
          {PERIOD_LABELS[filters.period]}: {getPeriodLabel()}
        </Badge>
        {filters.userFilter !== 'all' && (
          <Badge variant="secondary" className="text-sm">
            <Users className="h-3 w-3 mr-1" />
            {users.find(u => u.id === filters.userFilter)?.full_name || 'Selected Employee'}
            <button 
              className="ml-1 hover:text-red-600"
              onClick={() => setFilters({ userFilter: 'all' })}
            >
              ×
            </button>
          </Badge>
        )}
        {filters.issueTypeFilter !== 'all' && (
          <Badge variant="secondary" className="text-sm">
            {ISSUE_CATEGORIES[filters.issueTypeFilter].label}
            <button 
              className="ml-1 hover:text-red-600"
              onClick={() => setFilters({ issueTypeFilter: 'all' })}
            >
              ×
            </button>
          </Badge>
        )}
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Error loading issues: {error}</span>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vision Analysis & Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
      <IssueSummaryCards stats={stats} loading={loading} />
        </div>
        <div className="lg:col-span-1">
          <VisionAnalysisPanel compact={true} showActions={false} />
        </div>
      </div>

      {/* AI Executive Summary */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-100 mt-0.5">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-purple-900">AI Executive Summary</p>
                <Badge variant="default" className="bg-purple-600">
                  AI Analysis Active
                </Badge>
              </div>
              <p className="text-sm text-purple-800">
                {generateExecutiveSummary(
                  stats.totalIssues,
                  stats.employeesAffected,
                  stats.averageRiskScore,
                  stats.mostCommonIssue ? ISSUE_CATEGORIES[stats.mostCommonIssue].label : null
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Issue Charts */}
      <IssueCharts stats={stats} issues={issues} loading={loading} />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'issues' | 'employees' | 'dates')}>
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="issues" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Issues ({issues.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            By Employee ({employeeSummaries.length})
          </TabsTrigger>
          <TabsTrigger value="dates" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            By Date
          </TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="mt-6">
          <IssueList issues={issues} loading={loading} />
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <EmployeeIssuesBreakdown 
            employees={employeeSummaries} 
            loading={loading}
            onSelectEmployee={handleSelectEmployee}
          />
        </TabsContent>

        <TabsContent value="dates" className="mt-6">
          <IssuesByDateBreakdown 
            issues={issues} 
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      {/* Issue Type Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issue Types Reference</CardTitle>
          <CardDescription>
            Overview of detected issue categories and their severity levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(Object.entries(ISSUE_CATEGORIES) as [IssueType, typeof ISSUE_CATEGORIES[IssueType]][]).map(([type, category]) => {
              const Icon = ISSUE_TYPE_ICONS[type];
              const count = stats.issuesByType[type] || 0;
              const severityColors = SEVERITY_COLORS[category.severity];
              
              return (
                <div 
                  key={type}
                  className={`p-3 rounded-lg border ${category.borderColor} ${category.bgColor} flex items-start gap-3`}
                >
                  <div className="p-1.5 rounded bg-white/50">
                    <Icon className={`h-4 w-4 ${category.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium text-sm ${category.color}`}>
                        {category.label}
                      </p>
                      {count > 0 && (
                        <Badge variant="outline" className="text-xs px-1.5">
                          {count}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {category.description}
                    </p>
                    <Badge 
                      variant="outline" 
                      className={`mt-1.5 text-[10px] ${severityColors.bg} ${severityColors.text} ${severityColors.border}`}
                    >
                      {category.severity} severity
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

