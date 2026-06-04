import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, Timer, BarChart3, Activity, Pause, ChevronUp, ChevronDown, Copy, Loader2, Brain, Sparkles, Cpu, AlertTriangle, Eye, EyeOff, Moon, Wallet, UserRound } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';

// Import our modular components
import { Screenshot, FilterOptions } from './types';
import {
  DEFAULT_FILTER_OPTIONS,
  DEEPSEEK_SCREENSHOT_MODEL_OPTIONS,
  DEFAULT_DEEPSEEK_SCREENSHOT_MODEL,
  STORAGE_KEY_MANUAL_DEEPSEEK_MODEL,
  type DeepseekScreenshotModelId,
} from './constants';
import { useScreenshots } from './hooks/use-screenshots';
import { ScreenshotFilters } from './components/screenshot-filters';
import { ScreenshotStatsComponent } from './components/screenshot-stats';
import { ScreenshotGrid } from './components/screenshot-grid';
import { ScreenshotModal } from './components/screenshot-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CostManagementModal } from '@/components/admin/cost-management-modal';

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

export default function ScreenshotsViewer() {
  const { userDetails, isSuperAdmin } = useAuth();
  const isAdmin = userDetails?.role === 'admin';
  const organizationId = userDetails?.organization_id;
  const canViewCosts =
    isSuperAdmin || isAdmin || userDetails?.is_org_admin === true;
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [searchParams] = useSearchParams();
  
  // Filter state
  const [filters, setFilters] = useState<FilterOptions>({
    selectedDate: null,
    ...DEFAULT_FILTER_OPTIONS,
  });

  // Handle URL parameter for user filter
  useEffect(() => {
    const userParam = searchParams.get('user');
    if (userParam) {
      setFilters(prev => ({ ...prev, userFilter: userParam }));
    }
  }, [searchParams]);

  // Modal state
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Selection state for bulk operations
  const [selectedScreenshots, setSelectedScreenshots] = useState<string[]>([]);

  // Time group expansion state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Duplicate filter state
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  
  // Problem filter state
  const [problemFilter, setProblemFilter] = useState<'none' | 'idle' | 'low_activity' | 'all_problems'>('none');

  const readStoredDeepseekModel = (): DeepseekScreenshotModelId => {
    try {
      const s = localStorage.getItem(STORAGE_KEY_MANUAL_DEEPSEEK_MODEL);
      if (s === 'deepseek-v4-pro' || s === 'deepseek-v4-flash') return s;
    } catch {
      /* ignore */
    }
    return DEFAULT_DEEPSEEK_SCREENSHOT_MODEL;
  };

  const [manualDeepseekModel, setManualDeepseekModel] = useState<DeepseekScreenshotModelId>(() =>
    typeof window !== 'undefined' ? readStoredDeepseekModel() : DEFAULT_DEEPSEEK_SCREENSHOT_MODEL,
  );

  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MANUAL_DEEPSEEK_MODEL, manualDeepseekModel);
    } catch {
      /* ignore */
    }
  }, [manualDeepseekModel]);

  // Use our custom hook for data management
  const {
    screenshots,
    filteredScreenshots,
    users,
    projects,
    loading,
    stats,
    aiStatus,
    fetchData,
    deleteScreenshot,
    bulkDeleteScreenshots,
    estimateDeduction,
    triggerAIAnalysis,
    reanalyzeScreenshot,
    analyzeScreenshotsManual,
    fetchAIStatus
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

  // Handle select all in group
  const handleSelectAllInGroup = (group: TimeGroup) => {
    const groupScreenshotIds = group.screenshots.map(s => s.id);
    const allSelected = groupScreenshotIds.every(id => selectedScreenshots.includes(id));
    
    if (allSelected) {
      // Deselect all in group
      setSelectedScreenshots(prev => prev.filter(id => !groupScreenshotIds.includes(id)));
    } else {
      // Select all in group
      setSelectedScreenshots(prev => [...new Set([...prev, ...groupScreenshotIds])]);
    }
  };

  // Check if all screenshots in group are selected
  const isGroupFullySelected = (group: TimeGroup): boolean => {
    return group.screenshots.every(s => selectedScreenshots.includes(s.id));
  };

  // Check if some screenshots in group are selected
  const isGroupPartiallySelected = (group: TimeGroup): boolean => {
    return group.screenshots.some(s => selectedScreenshots.includes(s.id)) && !isGroupFullySelected(group);
  };

  // Handle screenshot click to open modal
  const handleScreenshotClick = (screenshot: Screenshot) => {
    setSelectedScreenshot(screenshot);
    setIsModalOpen(true);
  };

  // Helper function to find which session a screenshot belongs to
  const findScreenshotSession = (screenshotId: string, groups: TimeGroup[]): { 
    group: TimeGroup | null; 
    indexInGroup: number;
    groupIndex: number;
  } => {
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const indexInGroup = group.screenshots.findIndex(s => s.id === screenshotId);
      if (indexInGroup !== -1) {
        return { group, indexInGroup, groupIndex };
      }
    }
    return { group: null, indexInGroup: -1, groupIndex: -1 };
  };

  // Handle modal navigation - session-aware
  const handleModalNavigate = (direction: 'prev' | 'next') => {
    if (!selectedScreenshot) return;
    
    // Get the current time groups based on displayed screenshots
    const currentTimeGroups = generateTimeGroups(displayedScreenshots);
    
    // Find which session the current screenshot belongs to
    const { group, indexInGroup, groupIndex } = findScreenshotSession(selectedScreenshot.id, currentTimeGroups);
    
    // Fallback to flat navigation if not found in time groups (e.g., grid view without sessions)
    if (!group || currentTimeGroups.length === 0) {
      const screenshotsToNavigate = displayedScreenshots;
      
      // Guard: Check if screenshots array is non-empty before attempting navigation
      if (screenshotsToNavigate.length === 0) {
        return;
      }
      
      const currentIndex = screenshotsToNavigate.findIndex(s => s.id === selectedScreenshot.id);
      let newIndex: number;
      
      if (direction === 'prev') {
        newIndex = currentIndex > 0 ? currentIndex - 1 : screenshotsToNavigate.length - 1;
      } else {
        newIndex = currentIndex < screenshotsToNavigate.length - 1 ? currentIndex + 1 : 0;
      }
      
      setSelectedScreenshot(screenshotsToNavigate[newIndex]);
      return;
    }
    
    // Session-aware navigation
    if (direction === 'next') {
      if (indexInGroup < group.screenshots.length - 1) {
        // Next within same session
        setSelectedScreenshot(group.screenshots[indexInGroup + 1]);
      } else if (groupIndex < currentTimeGroups.length - 1) {
        // First screenshot of next session
        setSelectedScreenshot(currentTimeGroups[groupIndex + 1].screenshots[0]);
      } else {
        // Wrap to first screenshot of first session
        setSelectedScreenshot(currentTimeGroups[0].screenshots[0]);
      }
    } else {
      // direction === 'prev'
      if (indexInGroup > 0) {
        // Previous within same session
        setSelectedScreenshot(group.screenshots[indexInGroup - 1]);
      } else if (groupIndex > 0) {
        // Last screenshot of previous session
        const prevGroup = currentTimeGroups[groupIndex - 1];
        setSelectedScreenshot(prevGroup.screenshots[prevGroup.screenshots.length - 1]);
      } else {
        // Wrap to last screenshot of last session
        const lastGroup = currentTimeGroups[currentTimeGroups.length - 1];
        setSelectedScreenshot(lastGroup.screenshots[lastGroup.screenshots.length - 1]);
      }
    }
  };

  // Generate time groups for time-grouped view
  const generateTimeGroups = (screenshots: Screenshot[]): TimeGroup[] => {
    const groups: { [key: string]: TimeGroup } = {};
    // When viewing duplicates, keep the pair together by grouping duplicates into
    // the ORIGINAL screenshot's 30-min slot (prevents split across :30 boundary).
    const originalById = new Map<string, Screenshot>();
    if (showDuplicatesOnly) {
      screenshots.forEach(s => {
        originalById.set(s.id, s);
      });
    }

    screenshots.forEach(screenshot => {
      const user = users.find(u => u.id === screenshot.user_id);
      const groupCapturedAt = (() => {
        if (!showDuplicatesOnly) return new Date(screenshot.captured_at);
        if (!screenshot.is_duplicate) return new Date(screenshot.captured_at);
        if (!screenshot.duplicate_matched_id) return new Date(screenshot.captured_at);
        const original = originalById.get(screenshot.duplicate_matched_id);
        return original ? new Date(original.captured_at) : new Date(screenshot.captured_at);
      })();
      
      // Round to 30-minute intervals (e.g., 15:30-16:00, 16:00-16:30)
      const minutes = groupCapturedAt.getMinutes();
      const roundedMinutes = minutes < 30 ? 0 : 30;
      const startTime = new Date(groupCapturedAt);
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
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedScreenshots.length === 0) return;
    
    setIsDeletingBulk(true);
    try {
      await bulkDeleteScreenshots(selectedScreenshots);
      
      toast.success(`Successfully deleted ${selectedScreenshots.length} screenshot${selectedScreenshots.length !== 1 ? 's' : ''}`);
      setSelectedScreenshots([]);
    } catch (error) {
      toast.error('Failed to delete screenshots. Please try again.');
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // Get bulk delete details
  const getBulkDeleteDetails = () => {
    const selectedShots = filteredScreenshots.filter(s => selectedScreenshots.includes(s.id));
    if (selectedShots.length === 0) return null;

    const timestamps = selectedShots.map(s => new Date(s.captured_at).getTime());
    const minTime = new Date(Math.min(...timestamps));
    const maxTime = new Date(Math.max(...timestamps));
    
    const uniqueUsers = [...new Set(selectedShots.map(s => {
      const user = users.find(u => u.id === s.user_id);
      return user?.full_name || 'Unknown';
    }))];

    const durationMs = Math.max(...timestamps) - Math.min(...timestamps);
    const durationMinutes = Math.floor(durationMs / 60000);
    const durationHours = Math.floor(durationMinutes / 60);
    const remainingMinutes = durationMinutes % 60;

    return {
      count: selectedShots.length,
      timeRange: `${format(minTime, 'HH:mm:ss')} - ${format(maxTime, 'HH:mm:ss')}`,
      duration: `${durationHours}h ${remainingMinutes}m`,
      users: uniqueUsers,
      date: format(minTime, 'MMM dd, yyyy')
    };
  };

  const handleSingleDelete = async (id: string) => {
    try {
      await deleteScreenshot(id);
    } catch (error) {
      toast.error('Failed to delete screenshot');
    }
  };

  /** Single-screenshot manual AI (uses DeepSeek model from toolbar dropdown). */
  const handleReanalyzeWithVision = async (id: string) => {
    await reanalyzeScreenshot(id, { deepseek_model: manualDeepseekModel });
  };

  /** Bulk manual AI for checked screenshots in grid (admin only). */
  const handleAnalyzeSelected = async () => {
    if (selectedScreenshots.length === 0) return;
    setBulkAnalyzing(true);
    try {
      await analyzeScreenshotsManual(selectedScreenshots, manualDeepseekModel);
    } finally {
      setBulkAnalyzing(false);
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    setSelectedScreenshot(null);
    setIsModalOpen(false);
  };

  // Apply duplicate filter if enabled - include both duplicates AND their originals
  // ALWAYS keep pairs together even if they span different time slots
  let displayedScreenshots = showDuplicatesOnly 
    ? (() => {
        // Get all duplicate screenshots from filtered view
        const duplicates = filteredScreenshots.filter(s => s.is_duplicate);
        
        // Get IDs of original screenshots that duplicates match with
        const originalIds = new Set(
          duplicates
            .map(s => s.duplicate_matched_id)
            .filter((id): id is string => !!id)
        );
        
        // Get ALL duplicates that match the originals in the filtered view
        // This includes duplicates that might be outside the current time filter
        const originals = filteredScreenshots.filter(s => originalIds.has(s.id));
        const allRelatedDuplicateIds = new Set(
          screenshots // Use FULL screenshots array, not filtered
            .filter(s => s.is_duplicate && s.duplicate_matched_id && originalIds.has(s.duplicate_matched_id))
            .map(s => s.id)
        );
        
        // Return: duplicates + their originals + ALL related duplicates (even outside time filter)
        return screenshots.filter(s => 
          (s.is_duplicate && allRelatedDuplicateIds.has(s.id)) || 
          originalIds.has(s.id)
        );
      })()
    : filteredScreenshots;
  
  // Apply problem filter if enabled
  if (problemFilter !== 'none') {
    displayedScreenshots = displayedScreenshots.filter(s => {
      switch (problemFilter) {
        case 'idle':
          return s.idle_inferred;
        case 'low_activity':
          return (s.activity_percent || 0) < 30;
        case 'all_problems':
          return s.idle_inferred || 
                 (s.activity_percent || 0) < 30 || 
                 (s.consecutive_duplicate_count || 0) >= 10;
        default:
          return true;
      }
    });
  }

  const timeGroups = generateTimeGroups(displayedScreenshots);

  // Compute session info for the modal
  const getSessionInfo = () => {
    if (!selectedScreenshot) return undefined;
    
    const { group, indexInGroup, groupIndex } = findScreenshotSession(selectedScreenshot.id, timeGroups);
    
    if (!group) return undefined;
    
    return {
      timeSlot: group.timeSlot,
      employeeName: group.employeeName,
      indexInSession: indexInGroup,
      totalInSession: group.screenshots.length,
      sessionIndex: groupIndex,
      totalSessions: timeGroups.length,
    };
  };

  const sessionInfo = getSessionInfo();

  return (
    <div className="container py-6 space-y-6" data-testid="screenshots-gallery">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Screenshots</h1>
        <p className="text-muted-foreground">
          Select an employee to view all of their screenshots, or optionally filter to a single day.
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

      {/* Quick Problem Filters */}
      {isAdmin && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700 mr-2">Quick Filters:</span>
              <Button
                variant={problemFilter === 'none' ? "default" : "outline"}
                size="sm"
                onClick={() => setProblemFilter('none')}
                className={problemFilter === 'none' ? "" : "border-gray-300"}
              >
                <Eye className="h-4 w-4 mr-2" />
                Show All
              </Button>
              <Button
                variant={problemFilter === 'idle' ? "default" : "outline"}
                size="sm"
                onClick={() => setProblemFilter('idle')}
                className={problemFilter === 'idle' 
                  ? "bg-gray-600 hover:bg-gray-700" 
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"}
              >
                <Moon className="h-4 w-4 mr-2" />
                Idle Only
              </Button>
              <Button
                variant={problemFilter === 'low_activity' ? "default" : "outline"}
                size="sm"
                onClick={() => setProblemFilter('low_activity')}
                className={problemFilter === 'low_activity' 
                  ? "bg-yellow-600 hover:bg-yellow-700" 
                  : "border-yellow-300 text-yellow-700 hover:bg-yellow-50"}
              >
                <Activity className="h-4 w-4 mr-2" />
                Low Activity (&lt;30%)
              </Button>
              <Button
                variant={problemFilter === 'all_problems' ? "default" : "outline"}
                size="sm"
                onClick={() => setProblemFilter('all_problems')}
                className={problemFilter === 'all_problems' 
                  ? "bg-red-600 hover:bg-red-700" 
                  : "border-red-300 text-red-700 hover:bg-red-50"}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                All Problems
              </Button>
              {problemFilter !== 'none' && (
                <Badge variant="secondary" className="ml-2">
                  Showing {displayedScreenshots.length} of {filteredScreenshots.length}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Idle/Low Activity Alert Panel */}
      {isAdmin && (() => {
        const idleCount = displayedScreenshots.filter(s => s.idle_inferred).length;
        const lowActivityCount = displayedScreenshots.filter(s => (s.activity_percent || 0) < 30).length;
        const highDuplicateCount = displayedScreenshots.filter(s => (s.consecutive_duplicate_count || 0) >= 10).length;
        const totalProblematic = new Set([
          ...displayedScreenshots.filter(s => s.idle_inferred).map(s => s.id),
          ...displayedScreenshots.filter(s => (s.activity_percent || 0) < 30).map(s => s.id),
          ...displayedScreenshots.filter(s => (s.consecutive_duplicate_count || 0) >= 10).map(s => s.id)
        ]).size;

        // Calculate unproductive time estimate (assume 3 minutes per screenshot)
        const unproductiveMinutes = Math.round(totalProblematic * 3);
        const unproductiveHours = Math.floor(unproductiveMinutes / 60);
        const remainingMinutes = unproductiveMinutes % 60;
        const timeEstimate = unproductiveHours > 0 
          ? `${unproductiveHours}h ${remainingMinutes}m` 
          : `${remainingMinutes}m`;

        // Get users with high idle rates
        const userIdleStats = users
          .map(user => {
            const userScreenshots = displayedScreenshots.filter(s => s.user_id === user.id);
            const userIdle = userScreenshots.filter(s => s.idle_inferred || (s.activity_percent || 0) < 20).length;
            const idleRate = userScreenshots.length > 0 ? Math.round((userIdle / userScreenshots.length) * 100) : 0;
            return { user, idleRate, idleCount: userIdle, totalCount: userScreenshots.length };
          })
          .filter(stat => stat.idleRate >= 30 && stat.totalCount > 0)
          .sort((a, b) => b.idleRate - a.idleRate)
          .slice(0, 5);

        if (totalProblematic === 0) return null;

        return (
          <Card className="border-red-200 bg-gradient-to-r from-red-50/50 to-orange-50/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <CardTitle className="text-lg">⚠️ Productivity Concerns Detected</CardTitle>
                  <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                    <Moon className="h-3 w-3 mr-1" />
                    {totalProblematic} issues
                  </Badge>
                </div>
              </div>
              <CardDescription className="text-red-700">
                Idle time, low activity, and extended duplicates indicate potential productivity issues
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-white rounded-lg border border-red-100">
                  <div className="text-2xl font-bold text-red-600">{idleCount}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Moon className="h-3 w-3" />
                    Idle Screenshots
                  </div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-orange-100">
                  <div className="text-2xl font-bold text-orange-600">{lowActivityCount}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Activity className="h-3 w-3" />
                    Low Activity (&lt;30%)
                  </div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-amber-100">
                  <div className="text-2xl font-bold text-amber-600">{highDuplicateCount}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Copy className="h-3 w-3" />
                    High Duplicates (10+)
                  </div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-gray-100">
                  <div className="text-2xl font-bold text-gray-600">{timeEstimate}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Timer className="h-3 w-3" />
                    Est. Unproductive Time
                  </div>
                </div>
              </div>

              {userIdleStats.length > 0 && (
                <div className="p-3 bg-white rounded-lg border border-red-100">
                  <h4 className="text-sm font-semibold text-red-900 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Employees with High Idle Rates
                  </h4>
                  <div className="space-y-2">
                    {userIdleStats.map(stat => (
                      <div key={stat.user.id} className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-100">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            stat.idleRate >= 60 ? 'bg-red-600 animate-pulse' :
                            stat.idleRate >= 40 ? 'bg-orange-500' :
                            'bg-yellow-500'
                          }`} />
                          <span className="text-sm font-medium">{stat.user.full_name || stat.user.email}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {stat.idleCount}/{stat.totalCount} screenshots
                          </span>
                          <Badge variant={
                            stat.idleRate >= 60 ? "destructive" :
                            stat.idleRate >= 40 ? "default" :
                            "secondary"
                          } className={
                            stat.idleRate >= 60 ? "bg-red-600" :
                            stat.idleRate >= 40 ? "bg-orange-500" :
                            "bg-yellow-500"
                          }>
                            {stat.idleRate}% idle
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  <strong>What to do:</strong> Review screenshots with red/orange borders. High idle rates or consecutive duplicates may indicate extended breaks, meetings without work, or technical issues.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* AI Analysis Panel */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50/50 to-indigo-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg">AI Analysis</CardTitle>
              {aiStatus.aiEnabled ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                  Disabled
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchAIStatus()}
                      className="text-purple-600 border-purple-200 hover:bg-purple-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh AI Status</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {canViewCosts && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCostModalOpen(true)}
                        className="text-purple-600 border-purple-200 hover:bg-purple-50"
                      >
                        <Wallet className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Cost &amp; AI usage</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Button
                onClick={() => triggerAIAnalysis(50)}
                disabled={aiStatus.analyzing || !aiStatus.aiEnabled}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {aiStatus.analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Run AI Analysis
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row lg:items-end gap-4 mb-4 p-4 rounded-lg border bg-white/90 border-purple-100">
            <div className="space-y-2 flex-1 min-w-0">
              <Label htmlFor="manual-deepseek-model" className="text-sm font-medium">
                Model for manual screenshot AI
              </Label>
              <Select
                value={manualDeepseekModel}
                onValueChange={(v) => setManualDeepseekModel(v as DeepseekScreenshotModelId)}
              >
                <SelectTrigger id="manual-deepseek-model" className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEEPSEEK_SCREENSHOT_MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label} ({opt.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Applies to the grid action, enlarged view button, and analyzing selected screenshots. Choice is saved in this browser.
              </p>
            </div>
            {isAdmin && selectedScreenshots.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="border-purple-200 shrink-0"
                disabled={bulkAnalyzing || aiStatus.analyzing}
                onClick={() => void handleAnalyzeSelected()}
              >
                {bulkAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze selected ({selectedScreenshots.length})
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-purple-600">{stats.aiPending || 0}</div>
              <div className="text-xs text-muted-foreground">Pending Analysis</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-green-600">{stats.aiCompleted || 0}</div>
              <div className="text-xs text-muted-foreground">Analyzed</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-sm font-medium text-indigo-600 truncate">{aiStatus.models.text || 'Qwen3-32B'}</div>
              <div className="text-xs text-muted-foreground">Text Model</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-sm font-medium text-indigo-600 truncate">{aiStatus.models.vision || 'Qwen2.5-VL-7B'}</div>
              <div className="text-xs text-muted-foreground">Vision Model</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="flex items-center justify-center gap-1">
                <Cpu className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium capitalize">{aiStatus.aiProvider}</span>
              </div>
              <div className="text-xs text-muted-foreground">Provider</div>
            </div>
          </div>
          {aiStatus.loaded && !aiStatus.aiEnabled && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>AI Analysis Disabled:</strong> AI analysis is not currently running. Check Supabase Edge Functions and cron jobs.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Duplicate Detection Alert */}
      {stats.duplicateCount > 0 && (
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50/50 to-amber-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <CardTitle className="text-lg">Duplicate Screenshots Detected</CardTitle>
                <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                  <Copy className="h-3 w-3 mr-1" />
                  {stats.duplicateCount} duplicates
                </Badge>
              </div>
              <Button
                variant={showDuplicatesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                className={showDuplicatesOnly 
                  ? "bg-orange-600 hover:bg-orange-700 text-white" 
                  : "text-orange-600 border-orange-200 hover:bg-orange-50"}
              >
                {showDuplicatesOnly ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Show All
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    View Duplicates Only
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-white rounded-lg border border-orange-100">
                <div className="text-2xl font-bold text-orange-600">{stats.duplicateCount}</div>
                <div className="text-xs text-muted-foreground">Total Duplicates</div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border border-orange-100">
                <div className="text-2xl font-bold text-amber-600">{stats.duplicateGroups}</div>
                <div className="text-xs text-muted-foreground">Duplicate Groups</div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border border-orange-100">
                <div className="text-2xl font-bold text-red-600">{stats.lowActivityCount}</div>
                <div className="text-xs text-muted-foreground">Low Activity (&lt;20%)</div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border border-orange-100">
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round((stats.duplicateCount / Math.max(stats.total, 1)) * 100)}%
                </div>
                <div className="text-xs text-muted-foreground">Duplicate Rate</div>
              </div>
            </div>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>Note:</strong> Duplicate screenshots may indicate idle time or system issues. 
                Review these screenshots to identify potential productivity concerns.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Actions */}
      {selectedScreenshots.length > 0 && (() => {
        const deleteDetails = getBulkDeleteDetails();
        return (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-medium text-blue-900">
                    {selectedScreenshots.length} screenshot{selectedScreenshots.length !== 1 ? 's' : ''} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedScreenshots([])}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Clear Selection
                  </Button>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeletingBulk}>
                      {isDeletingBulk ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Delete Selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {deleteDetails?.count} Screenshot{deleteDetails?.count !== 1 ? 's' : ''}?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3 mt-2">
                          <p>You are about to permanently delete the selected screenshots. This action cannot be undone.</p>
                          
                          {deleteDetails && (
                            <div className="p-3 bg-muted rounded-md space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Count:</span>
                                <span className="font-medium">{deleteDetails.count} screenshot{deleteDetails.count !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Date:</span>
                                <span className="font-medium">{deleteDetails.date}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Time Range:</span>
                                <span className="font-medium">{deleteDetails.timeRange}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Duration:</span>
                                <span className="font-medium">{deleteDetails.duration}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Users:</span>
                                <span className="font-medium">{deleteDetails.users.join(', ')}</span>
                              </div>
                            </div>
                          )}

                          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                            <p className="text-sm text-destructive font-medium">
                              ⚠️ Warning: Deleted screenshots cannot be recovered.
                            </p>
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingBulk}>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleBulkDelete}
                        disabled={isDeletingBulk}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        {isDeletingBulk ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          'Delete Permanently'
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading screenshots...</p>
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
                    <div className="text-center py-8 text-muted-foreground space-y-2">
                      {!filters.selectedDate && filters.userFilter === 'all' ? (
                        <>
                          <UserRound className="h-10 w-10 mx-auto opacity-40" />
                          <p className="font-medium text-foreground">Choose an employee to get started</p>
                          <p className="text-sm max-w-md mx-auto">
                            Pick someone from the employee dropdown above to load their full screenshot
                            history. Use &quot;One day&quot; only when you want to filter by date.
                          </p>
                        </>
                      ) : (
                        <p>No screenshots found for the selected filters.</p>
                      )}
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
                        className="hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => toggleGroupExpansion(groupKey)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            {isAdmin && (
                              <div 
                                className="flex items-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isGroupFullySelected(group)}
                                  ref={(el) => {
                                    if (el) {
                                      el.indeterminate = isGroupPartiallySelected(group);
                                    }
                                  }}
                                  onChange={() => handleSelectAllInGroup(group)}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-1">
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
                                  className={`group relative bg-white rounded-lg shadow-sm border hover:shadow-md transition-all duration-200 cursor-pointer ${
                                    selectedScreenshots.includes(screenshot.id) ? 'ring-2 ring-blue-500 border-blue-500' : ''
                                  }`}
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
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 cursor-pointer"
                                      />
                                    </div>
                                  )}
                                  
                                  <div className="bg-gray-100 rounded-t-lg overflow-hidden relative">
                                    <img
                                      src={screenshot.image_url}
                                      alt={`Screenshot ${capturedTime}`}
                                      className="w-full h-auto max-h-[22rem] object-contain group-hover:scale-105 transition-transform duration-200"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.src = '/placeholder-screenshot.png';
                                      }}
                                    />
                                    
                                    {/* Activity/AI/Duplicate indicators */}
                                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                                      <Badge variant="secondary" className="text-xs">
                                        {screenshot.activity_percent || 0}%
                                      </Badge>
                                      {screenshot.ai_analysis_status && (
                                        <Badge 
                                          variant={screenshot.ai_analysis_status === 'completed' ? 'default' : 'outline'} 
                                          className="text-[10px]"
                                        >
                                          {screenshot.ai_analysis_status === 'completed' ? 'AI' : 'AI…'}
                                        </Badge>
                                      )}
                                      {screenshot.is_duplicate && (
                                        <Badge variant="destructive" className="text-xs">
                                          <Copy className="h-3 w-3 mr-1" />
                                          Duplicate
                                        </Badge>
                                      )}
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
              screenshots={displayedScreenshots}
              users={users}
              isAdmin={isAdmin}
              selectedScreenshots={selectedScreenshots}
              onScreenshotSelect={handleScreenshotSelect}
              onScreenshotClick={handleScreenshotClick}
              onDeleteScreenshot={handleSingleDelete}
              onEstimateDeduction={estimateDeduction}
              onReanalyzeScreenshot={handleReanalyzeWithVision}
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
        screenshots={displayedScreenshots}
        users={users}
        isOpen={isModalOpen}
        isAdmin={isAdmin}
        onClose={handleModalClose}
        onNavigate={handleModalNavigate}
        onDelete={handleSingleDelete}
        onEstimateDeduction={estimateDeduction}
        sessionInfo={sessionInfo}
        onRunAiAnalysis={isAdmin ? handleReanalyzeWithVision : undefined}
      />
      <CostManagementModal open={costModalOpen} onOpenChange={setCostModalOpen} />
    </div>
  );
} 