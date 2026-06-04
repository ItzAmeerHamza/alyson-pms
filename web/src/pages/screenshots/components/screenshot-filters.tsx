import React from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  UserRound,
  CalendarDays,
  Info,
  History,
} from 'lucide-react';
import { FilterOptions, User, Project } from '../types';

interface ScreenshotFiltersProps {
  filters: FilterOptions;
  users: User[];
  projects: Project[];
  onFiltersChange: (filters: Partial<FilterOptions>) => void;
}

export const ScreenshotFilters: React.FC<ScreenshotFiltersProps> = ({
  filters,
  users,
  projects,
  onFiltersChange,
}) => {
  const hasDate = Boolean(filters.selectedDate);
  const hasEmployee = filters.userFilter !== 'all';

  const selectedUser = hasEmployee
    ? users.find((u) => u.id === filters.userFilter)
    : null;

  const employeeLabel = selectedUser?.full_name || selectedUser?.email || 'Unknown';

  const handleDateNavigation = (direction: 'prev' | 'next') => {
    if (!filters.selectedDate) return;
    const [y, m, d] = filters.selectedDate.split('-').map(Number);
    const currentDate = new Date(y, m - 1, d);
    currentDate.setDate(currentDate.getDate() + (direction === 'prev' ? -1 : 1));
    onFiltersChange({ selectedDate: format(currentDate, 'yyyy-MM-dd') });
  };

  const enableAllDates = () => onFiltersChange({ selectedDate: null });

  const enableSingleDay = () => {
    if (!filters.selectedDate) {
      onFiltersChange({ selectedDate: format(new Date(), 'yyyy-MM-dd') });
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <Alert className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 dark:text-blue-100">How to browse screenshots</AlertTitle>
          <AlertDescription className="text-blue-800/90 dark:text-blue-200/90 space-y-1">
            <p>
              <strong>Step 1:</strong> Pick an employee — you will see <strong>all of their screenshots</strong>{' '}
              (every date).
            </p>
            <p>
              <strong>Step 2 (optional):</strong> Switch to &quot;One day&quot; and pick a date to narrow results to
              that day only.
            </p>
          </AlertDescription>
        </Alert>

        {/* Primary browse controls */}
        <div className="rounded-lg border-2 border-primary/20 bg-muted/30 p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Step 1 — Employee */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </span>
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <UserRound className="h-4 w-4 text-primary" />
                  Employee
                </label>
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                  Required
                </Badge>
              </div>
              <EmployeeFilterCombobox
                value={filters.userFilter}
                onValueChange={(value) => onFiltersChange({ userFilter: value })}
                users={users}
                placeholder="Choose an employee…"
                allLabel="— Select an employee —"
                className="w-full bg-background"
              />
              <p className="text-xs text-muted-foreground pl-8">
                {hasEmployee
                  ? `Showing every screenshot for ${employeeLabel}.`
                  : 'Choose someone from the list to load their full screenshot history.'}
              </p>
            </div>

            {/* Step 2 — Date (optional) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/30 text-foreground text-xs font-bold">
                  2
                </span>
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  Date range
                </label>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                  Optional
                </Badge>
              </div>

              <div className="flex rounded-md border bg-background p-1 gap-1">
                <Button
                  type="button"
                  variant={!hasDate ? 'default' : 'ghost'}
                  size="sm"
                  className="flex-1 gap-1.5 h-9"
                  onClick={enableAllDates}
                >
                  <History className="h-4 w-4" />
                  All dates
                </Button>
                <Button
                  type="button"
                  variant={hasDate ? 'default' : 'ghost'}
                  size="sm"
                  className="flex-1 gap-1.5 h-9"
                  onClick={enableSingleDay}
                >
                  <CalendarDays className="h-4 w-4" />
                  One day
                </Button>
              </div>

              {hasDate ? (
                <div className="flex items-center gap-1 pl-8">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => handleDateNavigation('prev')}
                    title="Previous day"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    type="date"
                    value={filters.selectedDate ?? ''}
                    onChange={(e) =>
                      onFiltersChange({
                        selectedDate: e.target.value || format(new Date(), 'yyyy-MM-dd'),
                      })
                    }
                    className="flex-1"
                    data-testid="date-filter"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => handleDateNavigation('next')}
                    title="Next day"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-8 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 shrink-0" />
                  No date filter — includes screenshots from every day.
                </p>
              )}

              {hasDate && (
                <p className="text-xs text-muted-foreground pl-8">
                  Only screenshots captured on {filters.selectedDate}.
                </p>
              )}
            </div>
          </div>

          {/* Live summary */}
          {hasEmployee && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-background px-3 py-2 text-sm">
              <span className="text-muted-foreground">Currently showing:</span>
              <Badge variant="secondary">{employeeLabel}</Badge>
              <span className="text-muted-foreground">·</span>
              {hasDate ? (
                <Badge variant="outline">{filters.selectedDate}</Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <History className="h-3 w-3" />
                  All dates
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Secondary filters */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Refine results
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Project</label>
              <Select
                value={filters.projectFilter}
                onValueChange={(value) => onFiltersChange({ projectFilter: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Content Category</label>
              <Select
                value={filters.contentFilter}
                onValueChange={(value) => onFiltersChange({ contentFilter: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="social_media">Social Media</SelectItem>
                  <SelectItem value="gaming">Gaming</SelectItem>
                  <SelectItem value="entertainment">Entertainment</SelectItem>
                  <SelectItem value="news">News</SelectItem>
                  <SelectItem value="shopping">Shopping</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Distraction Level</label>
              <Select
                value={filters.distractionFilter}
                onValueChange={(value) => onFiltersChange({ distractionFilter: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="high">High Distraction</SelectItem>
                  <SelectItem value="medium">Medium Distraction</SelectItem>
                  <SelectItem value="low">Low Distraction</SelectItem>
                  <SelectItem value="none">Focused</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Apps, URLs…"
                  value={filters.searchTerm}
                  onChange={(e) => onFiltersChange({ searchTerm: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">View Mode</label>
              <Select
                value={filters.viewMode}
                onValueChange={(value: 'time-grouped' | 'activity-breakdown' | 'grid') =>
                  onFiltersChange({ viewMode: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time-grouped">Time Grouped</SelectItem>
                  <SelectItem value="activity-breakdown">Activity Breakdown</SelectItem>
                  <SelectItem value="grid">Grid View</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
