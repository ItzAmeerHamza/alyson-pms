import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, Timer, BarChart3, Activity, Pause, ChevronUp, ChevronDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Import our modular components from screenshots
import { Screenshot, FilterOptions } from '../screenshots/types';
import { DEFAULT_FILTER_OPTIONS } from '../screenshots/constants';
import { useScreenshots } from '../screenshots/hooks/use-screenshots';
import { ScreenshotFilters } from '../screenshots/components/screenshot-filters';
import { ScreenshotStatsComponent } from '../screenshots/components/screenshot-stats';
import { ScreenshotGrid } from '../screenshots/components/screenshot-grid';
import { ScreenshotModal } from '../screenshots/components/screenshot-modal';

// Time grouping interface
interface TimeGroup {
  timeSlot: string;
  employeeId: string;
  employeeName: string;
  screenshots: Screenshot[];
  avgProductivity: number;
  activeTime: string;
  idleTime: string;
}

export default function ActivityMonitorPage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const isAdmin = userDetails?.role === 'admin';
  const organizationId = userDetails?.organization_id;
  
  // Filter state
  const [filters, setFilters] = useState<FilterOptions>({
    selectedDate: new Date().toLocaleDateString('en-CA'), // en-CA gives YYYY-MM-DD format in local timezone
    ...DEFAULT_FILTER_OPTIONS
  });

  // Modal state
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Selection state for bulk operations
  const [selectedScreenshots, setSelectedScreenshots] = useState<string[]>([]);

  // Time group expansion state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Use our custom hook for data management
  const {
    screenshots,
    filteredScreenshots,
    users,
    projects,
    loading,
    stats,
    fetchData,
    deleteScreenshot,
    bulkDeleteScreenshots
  } = useScreenshots(filters, isAdmin, userDetails?.id, organizationId, isSuperAdmin);

  // Handle filter changes
  const handleFiltersChange = (newFilters: Partial<FilterOptions>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  // Handle screenshot selection for bulk operations
  const handleScreenshotSelect = (id: string) => {
    setSelectedScreenshots(prev => 
      prev.includes(id) 
        ? prev.filter(sid => sid !== id)
        : [...prev, id]
    );
  };

  // Handle screenshot click to open modal
  const handleScreenshotClick = (screenshot: Screenshot) => {
    setSelectedScreenshot(screenshot);
    setIsModalOpen(true);
  };

  // Handle modal navigation
  const handleModalNavigate = (direction: 'prev' | 'next') => {
    if (!selectedScreenshot) return;
    
    const currentIndex = filteredScreenshots.findIndex(s => s.id === selectedScreenshot.id);
    let newIndex: number;
    
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : filteredScreenshots.length - 1;
    } else {
      newIndex = currentIndex < filteredScreenshots.length - 1 ? currentIndex + 1 : 0;
    }
    
    setSelectedScreenshot(filteredScreenshots[newIndex]);
  };

  // Generate time groups for time-grouped view
  const generateTimeGroups = (screenshots: Screenshot[]): TimeGroup[] => {
    const groups: { [key: string]: TimeGroup } = {};

    screenshots.forEach(screenshot => {
      const user = users.find(u => u.id === screenshot.user_id);
      const capturedAt = new Date(screenshot.captured_at);
      
      // Round to 30-minute intervals (e.g., 15:30-16:00, 16:00-16:30)
      const minutes = capturedAt.getMinutes();
      const roundedMinutes = minutes < 30 ? 0 : 30;
      const startTime = new Date(capturedAt);
      startTime.setMinutes(roundedMinutes, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(startTime.getMinutes() + 30);
      
      const timeSlot = format(startTime, 'HH:mm') + ' - ' + format(endTime, 'HH:mm');
      const groupKey = `${screenshot.user_id}-${timeSlot}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          timeSlot,
          employeeId: screenshot.user_id,
          employeeName: user?.full_name || 'Unknown User',
          screenshots: [],
          avgProductivity: 0,
          activeTime: '0m',
          idleTime: '0m'
        };
      }

      groups[groupKey].screenshots.push(screenshot);
    });

    // Calculate metrics for each group
    Object.values(groups).forEach(group => {
      const totalActivity = group.screenshots.reduce((sum, s) => sum + (s.activity_percent || 0), 0);
      group.avgProductivity = group.screenshots.length > 0 ? totalActivity / group.screenshots.length : 0;
      
      // Calculate actual time based on screenshot timespan
      const screenshots = group.screenshots.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
      if (screenshots.length > 1) {
        const firstTime = new Date(screenshots[0].captured_at);
        const lastTime = new Date(screenshots[screenshots.length - 1].captured_at);
        const totalMinutes = Math.max(1, Math.round((lastTime.getTime() - firstTime.getTime()) / 60000));
        group.activeTime = `${Math.round(totalMinutes * (group.avgProductivity / 100))}m`;
        group.idleTime = `${Math.round(totalMinutes * (1 - group.avgProductivity / 100))}m`;
      } else {
        // Single screenshot, assume 3 minutes of activity
        group.activeTime = `${Math.round(3 * (group.avgProductivity / 100))}m`;
        group.idleTime = `${Math.round(3 * (1 - group.avgProductivity / 100))}m`;
      }
    });

    return Object.values(groups).sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
  };

  // Toggle group expansion
  const toggleGroupExpansion = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  // Get grid columns based on screen size
  const getGridColumns = () => {
    return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4';
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedScreenshots.length === 0) return;
    
    try {
      await bulkDeleteScreenshots(selectedScreenshots);
      setSelectedScreenshots([]);
      toast.success(`Deleted ${selectedScreenshots.length} screenshots`);
    } catch (error) {
      toast.error('Failed to delete screenshots');
    }
  };

  // Handle single delete
  const handleSingleDelete = async (id: string) => {
    try {
      await deleteScreenshot(id);
      toast.success('Screenshot deleted');
    } catch (error) {
      toast.error('Failed to delete screenshot');
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    setSelectedScreenshot(null);
    setIsModalOpen(false);
  };

  const timeGroups = generateTimeGroups(filteredScreenshots);

  return (
    <div className="container py-6 space-y-6" data-testid="activity-monitor-content">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity Monitor</h1>
        <p className="text-muted-foreground">
          Monitor employee activity through real-time screenshot analysis
        </p>
      </div>

      {/* Filters */}
      <ScreenshotFilters
        filters={filters}
        users={users}
        projects={projects}
        onFiltersChange={handleFiltersChange}
        data-testid="date-filter"
      />

      {/* Stats */}
      <ScreenshotStatsComponent stats={stats} />

      {/* Bulk Actions */}
      {selectedScreenshots.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span>{selectedScreenshots.length} screenshots selected</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Screenshots</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedScreenshots.length} screenshot(s)? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading activity data...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Time Grouped View */}
          {filters.viewMode === 'time-grouped' && (
            <div className="space-y-4">
              {timeGroups.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8 text-muted-foreground">
                      No activity data found for the selected date and filters.
                    </div>
                  </CardContent>
                </Card>
              ) : (
                timeGroups.map((group, index) => {
                  const groupKey = `${group.employeeId}-${group.timeSlot}-${index}`;
                  const isExpanded = expandedGroups.has(groupKey);
                  
                  return (
                    <Card key={groupKey} className="overflow-hidden">
                      <CardHeader 
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleGroupExpansion(groupKey)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Timer className="h-5 w-5 text-blue-500" />
                              <CardTitle className="text-lg">{group.timeSlot}</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-sm">
                              {group.employeeName}
                            </Badge>
                            <Badge variant="secondary" className="text-sm">
                              {group.screenshots.length} screenshots
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm">
                              <BarChart3 className="h-4 w-4 text-green-500" />
                              <span className="font-medium">{Math.round(group.avgProductivity)}% productivity</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Activity className="h-4 w-4 text-blue-500" />
                              <span>{group.activeTime} active</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Pause className="h-4 w-4 text-orange-500" />
                              <span>{group.idleTime} idle</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupExpansion(groupKey);
                              }}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      
                      {isExpanded && (
                        <CardContent>
                          <div className={`grid gap-4 ${getGridColumns()}`}>
                            {group.screenshots.map((screenshot) => {
                              const capturedTime = format(new Date(screenshot.captured_at), 'HH:mm:ss');
                              
                              return (
                                <div
                                  key={screenshot.id}
                                  className="group relative bg-white rounded-lg shadow-sm border hover:shadow-md transition-all duration-200 cursor-pointer"
                                  onClick={() => handleScreenshotClick(screenshot)}
                                >
                                  {/* Selection Checkbox */}
                                  {isAdmin && (
                                    <div className="absolute top-2 left-2 z-10">
                                      <input
                                        type="checkbox"
                                        checked={selectedScreenshots.includes(screenshot.id)}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          handleScreenshotSelect(screenshot.id);
                                        }}
                                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                      />
                                    </div>
                                  )}
                                  
                                  <div className="bg-gray-100 rounded-t-lg overflow-hidden">
                                    <img
                                      src={screenshot.image_url}
                                      alt={`Screenshot ${capturedTime}`}
                                      className="w-full h-auto max-h-[22rem] object-contain group-hover:scale-105 transition-transform duration-200"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.src = '/placeholder-screenshot.png';
                                      }}
                                    />
                                    
                                    {/* Activity indicator overlay */}
                                    <div className="absolute top-2 right-2">
                                      <Badge variant="secondary" className="text-xs">
                                        {screenshot.activity_percent || 0}%
                                      </Badge>
                                    </div>
                                  </div>
                                  
                                  <div className="p-3">
                                    <div className="text-sm font-medium">{capturedTime}</div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {screenshot.app_name || screenshot.window_title || 'Unknown App'}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Grid View */}
          {filters.viewMode === 'grid' && (
            <ScreenshotGrid
              screenshots={filteredScreenshots}
              users={users}
              isAdmin={isAdmin}
              selectedScreenshots={selectedScreenshots}
              onScreenshotSelect={handleScreenshotSelect}
              onScreenshotClick={handleScreenshotClick}
              onDeleteScreenshot={handleSingleDelete}
            />
          )}

          {/* Activity Breakdown View - Placeholder */}
          {filters.viewMode === 'activity-breakdown' && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Activity Breakdown view coming soon...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Screenshot Modal */}
      <ScreenshotModal
        screenshot={selectedScreenshot}
        screenshots={filteredScreenshots}
        users={users}
        isOpen={isModalOpen}
        isAdmin={isAdmin}
        onClose={handleModalClose}
        onNavigate={handleModalNavigate}
        onDelete={handleSingleDelete}
      />
    </div>
  );
}
