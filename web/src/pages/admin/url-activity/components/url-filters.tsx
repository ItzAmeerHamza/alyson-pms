// URL Filters Component
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, Filter, Search, X, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { FilterOptions, User } from '../types';
import { TIME_OF_DAY_RANGES, DATE_PRESETS } from '../constants';
import { calculatePresetDateRange } from '../utils';

interface URLFiltersProps {
  filters: FilterOptions;
  onFiltersChange: (filters: Partial<FilterOptions>) => void;
  users: User[];
  onReset: () => void;
}

export const URLFilters: React.FC<URLFiltersProps> = ({
  filters,
  onFiltersChange,
  users,
  onReset,
}) => {
  const handleDateRangeSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      onFiltersChange({
        dateRange: { from: range.from, to: range.to },
        datePreset: 'custom'
      });
    }
  };

  const handlePresetClick = (presetId: string) => {
    if (presetId === 'custom') {
      return; // Custom is selected when manually picking dates
    }
    
    const dateRange = calculatePresetDateRange(presetId);
    onFiltersChange({
      dateRange,
      datePreset: presetId as FilterOptions['datePreset']
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Range Presets */}
        <div className="space-y-2">
          <Label>Quick Date Ranges</Label>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant={filters.datePreset === preset.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePresetClick(preset.id)}
                className="text-xs"
              >
                <span className="mr-1">{preset.icon}</span>
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div className="flex flex-col space-y-2">
            <Label>Date Range</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !filters.dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateRange?.from ? (
                    filters.dateRange.to ? (
                      <>
                        {format(filters.dateRange.from, "LLL dd, y")} -{" "}
                        {format(filters.dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(filters.dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={filters.dateRange?.from}
                  selected={filters.dateRange}
                  onSelect={handleDateRangeSelect}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* User Filter */}
          <div className="flex flex-col space-y-2">
            <Label>Employee</Label>
            <EmployeeFilterCombobox
              value={filters.userFilter}
              onValueChange={(value) => onFiltersChange({ userFilter: value })}
              users={users}
              allLabel="All Employees"
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-col space-y-2">
            <Label>Category</Label>
            <Select
              value={filters.categoryFilter}
              onValueChange={(value) => onFiltersChange({ categoryFilter: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Work">Work</SelectItem>
                <SelectItem value="Social Media">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    Social Media
                  </span>
                </SelectItem>
                <SelectItem value="Entertainment">Entertainment</SelectItem>
                <SelectItem value="Development">Development</SelectItem>
                <SelectItem value="Communication">Communication</SelectItem>
                <SelectItem value="Search">Search</SelectItem>
                <SelectItem value="Productivity">Productivity</SelectItem>
                <SelectItem value="News">News</SelectItem>
                <SelectItem value="Shopping">Shopping</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Browser Filter */}
          <div className="flex flex-col space-y-2">
            <Label>Browser</Label>
            <Select
              value={filters.browserFilter}
              onValueChange={(value) => onFiltersChange({ browserFilter: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Browsers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Browsers</SelectItem>
                <SelectItem value="Chrome">Chrome</SelectItem>
                <SelectItem value="Firefox">Firefox</SelectItem>
                <SelectItem value="Safari">Safari</SelectItem>
                <SelectItem value="Edge">Edge</SelectItem>
                <SelectItem value="Brave">Brave</SelectItem>
                <SelectItem value="Opera">Opera</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time of Day Filter */}
          <div className="flex flex-col space-y-2">
            <Label>Time of Day</Label>
            <Select
              value={filters.timeOfDayFilter}
              onValueChange={(value) => onFiltersChange({ timeOfDayFilter: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Day</SelectItem>
                <SelectItem value="morning">{TIME_OF_DAY_RANGES.morning.label}</SelectItem>
                <SelectItem value="afternoon">{TIME_OF_DAY_RANGES.afternoon.label}</SelectItem>
                <SelectItem value="evening">{TIME_OF_DAY_RANGES.evening.label}</SelectItem>
                <SelectItem value="night">{TIME_OF_DAY_RANGES.night.label}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="flex flex-col space-y-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sites, titles, users..."
                value={filters.searchTerm}
                onChange={(e) => onFiltersChange({ searchTerm: e.target.value })}
                className="pl-8"
              />
            </div>
          </div>

          {/* Social Media Only Toggle */}
          <div className="flex flex-col space-y-2">
            <Label className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Social Media Only
            </Label>
            <div className="flex items-center space-x-2 h-10 px-3 py-2 border rounded-md">
              <Switch
                checked={filters.socialMediaOnly}
                onCheckedChange={(checked) => onFiltersChange({ socialMediaOnly: checked })}
              />
              <span className="text-sm text-muted-foreground">
                {filters.socialMediaOnly ? 'On' : 'Off'}
              </span>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex flex-col space-y-2">
            <Label>View Mode</Label>
            <div className="flex gap-2">
              <Button
                variant={filters.viewMode === 'list' ? 'default' : 'outline'}
                onClick={() => onFiltersChange({ viewMode: 'list' })}
                className="flex-1"
              >
                List
              </Button>
              <Button
                variant={filters.viewMode === 'sessions' ? 'default' : 'outline'}
                onClick={() => onFiltersChange({ viewMode: 'sessions' })}
                className="flex-1"
              >
                Sessions
              </Button>
            </div>
          </div>

          {/* Group By Filter */}
          <div className="flex flex-col space-y-2">
            <Label>Group By</Label>
            <Select
              value={filters.groupBy}
              onValueChange={(value) => onFiltersChange({ groupBy: value as 'none' | 'user' | 'domain' | 'category' })}
            >
              <SelectTrigger>
                <SelectValue placeholder="No Grouping" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Grouping</SelectItem>
                <SelectItem value="user">
                  <span className="flex items-center gap-1">
                    👤 By User
                  </span>
                </SelectItem>
                <SelectItem value="domain">
                  <span className="flex items-center gap-1">
                    🌐 By Domain
                  </span>
                </SelectItem>
                <SelectItem value="category">
                  <span className="flex items-center gap-1">
                    📁 By Category
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filters Summary */}
        {(filters.categoryFilter !== 'all' || 
          filters.browserFilter !== 'all' || 
          filters.timeOfDayFilter !== 'all' || 
          filters.socialMediaOnly || 
          filters.searchTerm) && (
          <div className="pt-4 border-t">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {filters.categoryFilter !== 'all' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onFiltersChange({ categoryFilter: 'all' })}
                >
                  {filters.categoryFilter}
                  <X className="h-3 w-3 ml-1" />
                </Button>
              )}
              {filters.browserFilter !== 'all' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onFiltersChange({ browserFilter: 'all' })}
                >
                  {filters.browserFilter}
                  <X className="h-3 w-3 ml-1" />
                </Button>
              )}
              {filters.timeOfDayFilter !== 'all' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onFiltersChange({ timeOfDayFilter: 'all' })}
                >
                  {filters.timeOfDayFilter}
                  <X className="h-3 w-3 ml-1" />
                </Button>
              )}
              {filters.socialMediaOnly && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onFiltersChange({ socialMediaOnly: false })}
                  className="text-red-600"
                >
                  Social Media Only
                  <X className="h-3 w-3 ml-1" />
                </Button>
              )}
              {filters.searchTerm && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onFiltersChange({ searchTerm: '' })}
                >
                  "{filters.searchTerm}"
                  <X className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

