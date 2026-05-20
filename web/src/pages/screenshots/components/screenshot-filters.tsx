import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Input } from '@/components/ui/input';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';
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
  onFiltersChange
}) => {
  const handleDateNavigation = (direction: 'prev' | 'next') => {
    const currentDate = new Date(filters.selectedDate);
    const newDate = new Date(currentDate);
    
    if (direction === 'prev') {
      newDate.setDate(currentDate.getDate() - 1);
    } else {
      newDate.setDate(currentDate.getDate() + 1);
    }
    
    onFiltersChange({ selectedDate: newDate.toISOString().split('T')[0] });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Date Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Date</label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateNavigation('prev')}
                className="h-8 w-8 p-0"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={filters.selectedDate}
                onChange={(e) => onFiltersChange({ selectedDate: e.target.value })}
                className="flex-1"
                data-testid="date-filter"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateNavigation('next')}
                className="h-8 w-8 p-0"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Employee Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Employee</label>
            <EmployeeFilterCombobox
              value={filters.userFilter}
              onValueChange={(value) => onFiltersChange({ userFilter: value })}
              users={users}
            />
          </div>
          
          {/* Project Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Project</label>
            <Select value={filters.projectFilter} onValueChange={(value) => onFiltersChange({ projectFilter: value })}>
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

          {/* Content Category Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Content Category</label>
            <Select value={filters.contentFilter} onValueChange={(value) => onFiltersChange({ contentFilter: value })}>
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

          {/* Distraction Level Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Distraction Level</label>
            <Select value={filters.distractionFilter} onValueChange={(value) => onFiltersChange({ distractionFilter: value })}>
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

          {/* Search Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users, apps, URLs..."
                value={filters.searchTerm}
                onChange={(e) => onFiltersChange({ searchTerm: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>

          {/* View Mode Filter */}
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
      </CardContent>
    </Card>
  );
}; 