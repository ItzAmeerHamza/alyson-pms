import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/providers/auth-provider';
import { format, startOfDay, endOfDay, addMinutes } from 'date-fns';
import { 
  Monitor, 
  Search, 
  Filter, 
  Clock, 
  Activity, 
  Pause, 
  Grid, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Screenshot {
  id: string;
  user_id: string;
  project_id: string | null;
  captured_at: string;
  image_url: string;
  activity_percent: number;
  focus_percent: number;
  mouse_clicks?: number;
  keystrokes?: number;
  mouse_movements?: number;
  [key: string]: any;
}

interface User {
  id: string;
  email: string;
  full_name?: string;
}

interface Project {
  id: string;
  name: string;
}

interface ActivityPeriod {
  start: string;
  end: string;
  type: 'active' | 'idle';
  duration: number;
  screenshots: Screenshot[];
}

export default function AppsViewer() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString('en-CA') // en-CA gives YYYY-MM-DD format in local timezone
  );
  const [userFilter, setUserFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>('timeline');
  const [gridSize, setGridSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set());
  
  // Add modal states
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (userDetails) {
      fetchData();
    }
  }, [selectedDate, userFilter, userDetails, organizationId, isSuperAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Use local timezone consistently to match how dates are displayed
      const selectedLocalDate = new Date(selectedDate + 'T00:00:00'); // Local timezone interpretation
      const startDate = startOfDay(selectedLocalDate);
      const endDate = endOfDay(selectedLocalDate);

      console.log(`🔍 [APPS-QUERY] Searching for date: ${selectedDate}`);
      console.log(`🔍 [APPS-QUERY] Local timezone range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      console.log(`🔍 [APPS-QUERY] Local timezone offset: ${new Date().getTimezoneOffset()} minutes`);

      const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');
      let query = supabase
        .from('screenshots')
        .select('*')
        .order('captured_at', { ascending: true });
      
      if (isToday) {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        query = query.gte('captured_at', last24Hours.toISOString());
      } else {
        query = query
          .gte('captured_at', startDate.toISOString())
          .lt('captured_at', endDate.toISOString());
      }

      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }

      // Push employee filter to DB to avoid hitting the default 1000-row limit
      if (userFilter && userFilter !== 'all') {
        query = query.eq('user_id', userFilter);
      }

      const screenshotsData = await fetchPaginated<any>(query);
      
      // Filter for desktop applications only (focus_percent <= 70 indicates desktop apps)
      const appScreenshots: Screenshot[] = (screenshotsData || [])
        .filter((screenshot: any) => 
          screenshot.user_id !== null && 
          (screenshot.focus_percent <= 70 || screenshot.activity_percent > 50)
        )
        .map((screenshot: any) => ({
          id: screenshot.id,
          user_id: screenshot.user_id,
          project_id: screenshot.project_id,
          captured_at: screenshot.captured_at,
          image_url: screenshot.image_url,
          activity_percent: screenshot.activity_percent || 0,
          focus_percent: screenshot.focus_percent || 0
        }));

      setScreenshots(appScreenshots);

      // Fetch users
      let usersQuery = supabase
        .from('users')
        .select('id, email, full_name')
        .in('role', ['employee', 'admin', 'manager']);
      
      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        usersQuery = usersQuery.eq('organization_id', organizationId);
      }
      
      let { data: usersData, error: usersError } = await usersQuery;

      if (usersError) throw usersError;
      setUsers(usersData || []);

      // Fetch projects
      let projectsQuery = supabase
        .from('projects')
        .select('id, name');
      
      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        projectsQuery = projectsQuery.eq('organization_id', organizationId);
      }
      
      let { data: projectsData, error: projectsError } = await projectsQuery;

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

    } catch (error) {
      console.error('Error fetching apps data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredScreenshots = screenshots.filter((s: any) => {
    const userMatch = userFilter === 'all' || s.user_id === userFilter;
    const projectMatch = projectFilter === 'all' || s.project_id === projectFilter;
    const searchMatch = searchTerm === '' || 
      users.find(u => u.id === s.user_id)?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      projects.find(p => p.id === s.project_id)?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return userMatch && projectMatch && searchMatch;
  });

  const generateActivityPeriods = (): ActivityPeriod[] => {
    const periods: ActivityPeriod[] = [];
    let currentPeriod: ActivityPeriod | null = null;

    const sortedScreenshots = [...filteredScreenshots].sort((a, b) => 
      new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );

    sortedScreenshots.forEach((screenshot) => {
      const capturedTime = format(new Date(screenshot.captured_at), 'HH:mm');
      const isActive = screenshot.activity_percent > 30;
      const periodType = isActive ? 'active' : 'idle';

      if (!currentPeriod || currentPeriod.type !== periodType) {
        if (currentPeriod) {
          periods.push(currentPeriod);
        }
        
        currentPeriod = {
          start: capturedTime,
          end: capturedTime,
          type: periodType,
          duration: 10,
          screenshots: [screenshot]
        };
      } else {
        currentPeriod.end = capturedTime;
        currentPeriod.duration += 10;
        currentPeriod.screenshots.push(screenshot);
      }
    });

    if (currentPeriod) {
      periods.push(currentPeriod);
    }

    return periods;
  };

  const activityPeriods = generateActivityPeriods();
  const totalActiveTime = activityPeriods
    .filter(p => p.type === 'active')
    .reduce((sum, p) => sum + p.duration, 0);
  const totalIdleTime = activityPeriods
    .filter(p => p.type === 'idle')
    .reduce((sum, p) => sum + p.duration, 0);

  const togglePeriodExpansion = (index: number) => {
    const newExpanded = new Set(expandedPeriods);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPeriods(newExpanded);
  };

  const getGridColumns = () => {
    switch (gridSize) {
      case 'small': return 'grid-cols-8';
      case 'medium': return 'grid-cols-6';
      case 'large': return 'grid-cols-4';
      default: return 'grid-cols-6';
    }
  };

  // Add navigation functions
  const getCurrentScreenshotIndex = useCallback(() => {
    if (!selectedScreenshot) return -1;
    return filteredScreenshots.findIndex(s => s.id === selectedScreenshot.id);
  }, [selectedScreenshot, filteredScreenshots]);

  const navigateToScreenshot = useCallback((direction: 'prev' | 'next') => {
    const currentIndex = getCurrentScreenshotIndex();
    if (currentIndex === -1) return;

    let newIndex;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : filteredScreenshots.length - 1;
    } else {
      newIndex = currentIndex < filteredScreenshots.length - 1 ? currentIndex + 1 : 0;
    }

    const newScreenshot = filteredScreenshots[newIndex];
    if (newScreenshot) {
      setSelectedScreenshot(newScreenshot);
      setCurrentImageIndex(newIndex);
    }
  }, [getCurrentScreenshotIndex, filteredScreenshots]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isModalOpen) return;
      
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          navigateToScreenshot('prev');
          break;
        case 'ArrowRight':
          event.preventDefault();
          navigateToScreenshot('next');
          break;
        case 'Escape':
          event.preventDefault();
          closeScreenshotModal();
          break;
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isModalOpen, navigateToScreenshot]);

  // Touch/swipe support
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      navigateToScreenshot('next');
    } else if (isRightSwipe) {
      navigateToScreenshot('prev');
    }
  };

  // Add modal handler functions
  const handleViewScreenshot = (screenshot: Screenshot) => {
    setSelectedScreenshot(screenshot);
    setCurrentImageIndex(getCurrentScreenshotIndex());
    setIsModalOpen(true);
  };

  const closeScreenshotModal = () => {
    setSelectedScreenshot(null);
    setIsModalOpen(false);
    setCurrentImageIndex(0);
  };

  const handleDownloadScreenshot = async (imageUrl: string, fileName: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Screenshot downloaded');
    } catch (error) {
      console.error('Error downloading screenshot:', error);
      toast.error('Failed to download screenshot');
    }
  };

  if (userDetails?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Monitor className="h-8 w-8" />
            Desktop Applications
          </h1>
          <p className="text-muted-foreground">Monitor desktop application usage and activity</p>
        </div>
        
        {/* View Mode Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            onClick={() => setViewMode('grid')}
            size="sm"
          >
            <Grid className="h-4 w-4 mr-2" />
            Grid
          </Button>
          <Button
            variant={viewMode === 'timeline' ? 'default' : 'outline'}
            onClick={() => setViewMode('timeline')}
            size="sm"
          >
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Date</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Employee</label>
              <EmployeeFilterCombobox
                value={userFilter}
                onValueChange={setUserFilter}
                users={users}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Project</label>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
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
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users, projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Grid Size</label>
              <Select value={gridSize} onValueChange={(value: 'small' | 'medium' | 'large') => setGridSize(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{filteredScreenshots.length}</div>
              <div className="text-sm text-muted-foreground">App Screenshots</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{Math.round(totalActiveTime / 60)}h</div>
              <div className="text-sm text-muted-foreground">Active Time</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{Math.round(totalIdleTime / 60)}h</div>
              <div className="text-sm text-muted-foreground">Idle Time</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{activityPeriods.length}</div>
              <div className="text-sm text-muted-foreground">Activity Periods</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">Loading desktop applications...</div>
          </CardContent>
        </Card>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Desktop Applications Grid
                </CardTitle>
                <CardDescription>
                  Screenshots from desktop applications and software
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredScreenshots.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No desktop application screenshots found for the selected date and filters.
                  </div>
                ) : (
                  <div className={`grid gap-4 ${getGridColumns()}`}>
                    {filteredScreenshots.map((screenshot) => {
                      const user = users.find(u => u.id === screenshot.user_id);
                      const project = projects.find(p => p.id === screenshot.project_id);
                      const capturedTime = format(new Date(screenshot.captured_at), 'HH:mm');
                      
                      return (
                        <div
                          key={screenshot.id}
                          className="group relative bg-white rounded-lg shadow-sm border hover:shadow-md transition-all duration-200 cursor-pointer"
                          onClick={() => handleViewScreenshot(screenshot)}
                        >
                          <div className="bg-gray-100 rounded-t-lg overflow-hidden">
                            <img
                              src={screenshot.image_url}
                              alt={`App Screenshot ${capturedTime}`}
                              className="w-full h-auto max-h-80 object-contain group-hover:scale-105 transition-transform duration-200"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/placeholder-screenshot.png';
                              }}
                            />
                            
                            {/* Activity indicator overlay */}
                            <div className="absolute top-2 right-2">
                              <Badge
                                variant={screenshot.activity_percent > 50 ? 'default' : 'secondary'}
                                className={`text-xs ${
                                  screenshot.activity_percent > 50
                                    ? 'bg-green-500 hover:bg-green-600'
                                    : screenshot.activity_percent > 20
                                    ? 'bg-yellow-500 hover:bg-yellow-600'
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                              >
                                {screenshot.activity_percent}%
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="p-3 border-t">
                            {/* Time and Activity Level */}
                            <div className="flex justify-between items-start mb-2">
                              <div className="text-sm font-medium text-gray-900">
                                {capturedTime}
                              </div>
                              <Badge 
                                variant={
                                  (screenshot.activity_percent || 0) >= 70 ? "default" : 
                                  (screenshot.activity_percent || 0) >= 30 ? "secondary" : 
                                  "outline"
                                }
                                className="text-xs"
                              >
                                {(screenshot.activity_percent || 0) >= 70 ? 'High' : 
                                 (screenshot.activity_percent || 0) >= 30 ? 'Medium' : 
                                 'Low'} Activity
                              </Badge>
                            </div>

                            {/* Activity Details Grid */}
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                              <div>Focus: {screenshot.focus_percent || 0}%</div>
                              <div>Clicks: {screenshot.mouse_clicks || 0}</div>
                              <div>Keys: {screenshot.keystrokes || 0}</div>
                              <div>Moves: {screenshot.mouse_movements || 0}</div>
                            </div>
                            
                            {/* User and Project */}
                            <div className="text-xs text-gray-500 truncate mb-1">
                              {user?.full_name || user?.email || 'Unknown User'}
                            </div>
                            <div className="text-xs text-gray-400 truncate mb-2">
                              {project?.name || 'No Project'}
                            </div>
                            
                            {/* App Type Badge */}
                            <div className="flex items-center justify-start">
                              <Badge variant="outline" className="text-xs">
                                <Monitor className="h-3 w-3 mr-1" />
                                App
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Desktop Applications Timeline
                </CardTitle>
                <CardDescription>
                  Timeline showing desktop application usage periods
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activityPeriods.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No activity periods found for desktop applications.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activityPeriods.map((period, index) => (
                      <div
                        key={index}
                        className={`border rounded-lg p-4 ${
                          period.type === 'active'
                            ? 'border-green-200 bg-green-50'
                            : 'border-orange-200 bg-orange-50'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={period.type === 'active' ? 'default' : 'secondary'}
                              className={
                                period.type === 'active'
                                  ? 'bg-green-500 hover:bg-green-600'
                                  : 'bg-orange-500 hover:bg-orange-600'
                              }
                            >
                              {period.type === 'active' ? (
                                <Activity className="h-3 w-3 mr-1" />
                              ) : (
                                <Pause className="h-3 w-3 mr-1" />
                              )}
                              {period.type.toUpperCase()}
                            </Badge>
                            <span className="font-medium">
                              {period.start} - {period.end}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              ({Math.round(period.duration / 60)}h {period.duration % 60}m, {period.screenshots.length} screenshots)
                            </span>
                            {/* Add employee name to activity timeline */}
                            {period.screenshots.length > 0 && (
                              <span className="text-sm font-medium text-blue-600">
                                {users.find(u => u.id === period.screenshots[0].user_id)?.full_name || 'Unknown User'}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => togglePeriodExpansion(index)}
                          >
                            {expandedPeriods.has(index) ? 
                              <ChevronUp className="h-4 w-4" /> : 
                              <ChevronDown className="h-4 w-4" />
                            }
                          </Button>
                        </div>
                        
                        {expandedPeriods.has(index) && (
                          <div className={`grid gap-2 ${getGridColumns()}`}>
                            {period.screenshots.map((screenshot) => (
                              <div
                                key={screenshot.id}
                                className="aspect-video bg-gray-100 rounded-md overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => handleViewScreenshot(screenshot)}
                              >
                                <img
                                  src={screenshot.image_url}
                                  alt={`Screenshot ${format(new Date(screenshot.captured_at), 'HH:mm')}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = '/placeholder-screenshot.png';
                                  }}
                                />
                                <div className="p-2 bg-white bg-opacity-90">
                                  <div className="text-xs text-gray-600">
                                    {format(new Date(screenshot.captured_at), 'HH:mm')}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Activity: {screenshot.activity_percent}%
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Enhanced Screenshot Modal with Navigation */}
      {selectedScreenshot && (
        <Dialog open={isModalOpen} onOpenChange={closeScreenshotModal}>
          <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>App Screenshot Details</span>
                  <Badge variant="outline" className="text-xs">
                    {getCurrentScreenshotIndex() + 1} of {filteredScreenshots.length}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={closeScreenshotModal}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            
            <div className="relative">
              {/* Navigation Buttons */}
              <Button
                variant="outline"
                size="sm"
                className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg"
                onClick={() => navigateToScreenshot('prev')}
                disabled={filteredScreenshots.length <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg"
                onClick={() => navigateToScreenshot('next')}
                disabled={filteredScreenshots.length <= 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              {/* Image with touch support */}
              <div
                className="select-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <img
                  src={selectedScreenshot.image_url}
                  alt={`App Screenshot ${selectedScreenshot.id}`}
                  className="w-full h-auto rounded-lg max-h-[65vh] object-contain cursor-pointer"
                  onClick={() => navigateToScreenshot('next')}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder-screenshot.png';
                  }}
                />
              </div>
            </div>

            {/* Screenshot Details */}
            <div className="space-y-4 max-h-[25vh] overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Captured:</span>
                  <p className="text-muted-foreground">
                    {format(new Date(selectedScreenshot.captured_at), 'MMM dd, yyyy HH:mm:ss')}
                  </p>
                </div>
                <div>
                  <span className="font-medium">User:</span>
                  <p className="text-muted-foreground">
                    {users.find(u => u.id === selectedScreenshot.user_id)?.full_name || 'Unknown User'}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Activity:</span>
                  <p className="text-muted-foreground">
                    {selectedScreenshot.activity_percent ? `${selectedScreenshot.activity_percent}%` : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Focus:</span>
                  <p className="text-muted-foreground">
                    {selectedScreenshot.focus_percent ? `${selectedScreenshot.focus_percent}%` : 'N/A'}
                  </p>
                </div>
              </div>
              
              {/* Navigation Instructions */}
              <div className="text-xs text-muted-foreground text-center border-t pt-2">
                Use arrow keys ← → or swipe left/right to navigate • Click image to go next • ESC to close
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => handleDownloadScreenshot(
                    selectedScreenshot.image_url,
                    `app-screenshot-${selectedScreenshot.id}.${selectedScreenshot.file_path?.endsWith('.jpg') ? 'jpg' : 'png'}`
                  )}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 