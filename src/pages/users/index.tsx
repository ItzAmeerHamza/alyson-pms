import * as React from "react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { Pause, Play, Trash2, User, Users, Clock, Activity, BarChart3, Calendar, TrendingUp, Mail, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { calculateSessionHours } from "@/lib/time-utils";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean | null;
  paused_at: string | null;
  paused_by: string | null;
  pause_reason: string | null;
  last_activity: string | null;
  salary_amount: number | null;
  created_at?: string;
  last_sign_in_at?: string;
  agent_version?: string | null; // Add agent version tracking
}

interface UserActivitySummary {
  user_id: string;
  total_hours: number;
  last_login: string | null;
  screenshots_today: number;
  avg_activity_level: number;
  productive_hours_week: number;
  last_screenshot: string | null;
  agent_version?: string | null; // Add agent version
}

interface UserProfileData {
  basic_info: User;
  activity_summary: UserActivitySummary;
  recent_activity: Array<{
    date: string;
    hours_worked: number;
    avg_activity: number;
    screenshots_count: number;
  }>;
  productivity_trends: Array<{
    week: string;
    productivity_score: number;
    hours_worked: number;
  }>;
}

const USERS_PER_PAGE = 15;

const UsersPage: React.FC = () => {
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<User[]>([]);
  const [userActivitySummaries, setUserActivitySummaries] = useState<Map<string, UserActivitySummary>>(new Map());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<UserProfileData | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [activePage, setActivePage] = useState(1);
  const [inactivePage, setInactivePage] = useState(1);
  const { toast } = useToast();
  const { user, userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;

  // Fetch users and their activity summaries
  useEffect(() => {
    fetchUsers();
    fetchUserActivitySummaries();
  }, []);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from("users")
        .select(`
          id,
          email,
          full_name,
          role,
          avatar_url,
          is_active,
          paused_at,
          paused_by,
          pause_reason,
          last_activity,
          salary_amount
        `);
      
      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query.order("full_name");

      if (error) {
        throw error;
      }

      // Convert the data to match our User interface, handling null is_active values
      const users = (data || []).map(user => ({
        ...user,
        is_active: user.is_active ?? true // Default to true if null
      }));
      
      setActiveUsers(users.filter(u => u.is_active));
      setInactiveUsers(users.filter(u => !u.is_active));
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserActivitySummaries = async () => {
    try {
      const thirtyDaysAgo = subDays(new Date(), 30);
      const sevenDaysAgo = subDays(new Date(), 7);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all users first
      let usersQuery = supabase
        .from('users')
        .select('id');
      
      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        usersQuery = usersQuery.eq('organization_id', organizationId);
      }
      
      const { data: users, error: usersError } = await usersQuery;

      if (usersError) throw usersError;

      const userIds = (users || []).map(u => u.id);
      if (userIds.length === 0) return;

      // BATCH QUERIES - fetch all data in parallel for better performance
      const [
        agentVersionsResult,
        timeLogsResult,
        todayScreenshotsResult,
        weekTimeLogsResult,
        lastScreenshotsResult
      ] = await Promise.all([
        // Agent versions from screenshots (recent 200 to cover all users)
        supabase
          .from('screenshots')
          .select('user_id, agent_version, captured_at')
          .in('user_id', userIds)
          .not('agent_version', 'is', null)
          .order('captured_at', { ascending: false })
          .limit(200),
        // Time logs for last 30 days
        supabase
          .from('time_logs')
          .select('user_id, start_time, end_time')
          .in('user_id', userIds)
          .gte('start_time', thirtyDaysAgo.toISOString())
          .not('end_time', 'is', null),
        // Today's screenshots
        supabase
          .from('screenshots')
          .select('user_id, id, activity_percent, captured_at')
          .in('user_id', userIds)
          .gte('captured_at', today.toISOString()),
        // Week's time logs
        supabase
          .from('time_logs')
          .select('user_id, start_time, end_time')
          .in('user_id', userIds)
          .gte('start_time', sevenDaysAgo.toISOString())
          .not('end_time', 'is', null),
        // Last screenshots (recent 100 to cover active users)
        supabase
          .from('screenshots')
          .select('user_id, captured_at')
          .in('user_id', userIds)
          .order('captured_at', { ascending: false })
          .limit(100)
      ]);

      // Build lookup maps for efficient access
      const agentVersionMap = new Map<string, string>();
      (agentVersionsResult.data || []).forEach(row => {
        if (row.user_id && row.agent_version && !agentVersionMap.has(row.user_id)) {
          agentVersionMap.set(row.user_id, row.agent_version);
        }
      });

      // Fallback: fetch version individually for offline users missed by the limit(200) batch
      const missingVersionIds = userIds.filter(id => !agentVersionMap.has(id));
      if (missingVersionIds.length > 0) {
        const fallbackResults = await Promise.all(
          missingVersionIds.map(uid =>
            supabase
              .from('screenshots')
              .select('user_id, agent_version')
              .eq('user_id', uid)
              .not('agent_version', 'is', null)
              .order('captured_at', { ascending: false })
              .limit(1)
          )
        );
        fallbackResults.forEach(({ data }) => {
          if (data?.[0]?.user_id && data[0].agent_version) {
            agentVersionMap.set(data[0].user_id, data[0].agent_version);
          }
        });
      }

      const lastScreenshotMap = new Map<string, string>();
      (lastScreenshotsResult.data || []).forEach(row => {
        if (row.user_id && row.captured_at && !lastScreenshotMap.has(row.user_id)) {
          lastScreenshotMap.set(row.user_id, row.captured_at);
        }
      });

      const summaries = new Map<string, UserActivitySummary>();

      // Process data for each user from the batched results
      for (const user of users || []) {
        const userId = user.id;
        
        // Get agent version from map
        const agentVersionData = agentVersionMap.has(userId) 
          ? [{ agent_version: agentVersionMap.get(userId) }] 
          : null;

        // Filter time logs for this user
        const timeLogs = (timeLogsResult.data || []).filter(log => log.user_id === userId);
        const weekTimeLogs = (weekTimeLogsResult.data || []).filter(log => log.user_id === userId);
        const todayScreenshots = (todayScreenshotsResult.data || []).filter(s => s.user_id === userId);
        const lastScreenshotTime = lastScreenshotMap.get(userId);

        // Calculate totals
        const totalHours = timeLogs.reduce((sum, log) => {
          if (log.end_time) {
            return sum + calculateSessionHours(log.start_time, log.end_time);
          }
          return sum;
        }, 0);

        const productiveHoursWeek = weekTimeLogs.reduce((sum, log) => {
          if (log.end_time) {
            return sum + calculateSessionHours(log.start_time, log.end_time);
          }
          return sum;
        }, 0);

        const avgActivityLevel = todayScreenshots && todayScreenshots.length > 0 
          ? todayScreenshots.reduce((sum, shot) => sum + (shot.activity_percent || 0), 0) / todayScreenshots.length
          : 0;

        const lastLogin = null; // Will be implemented later when auth table is available
        const agentVersion = agentVersionData && agentVersionData.length > 0 ? agentVersionData[0].agent_version : null;

        summaries.set(user.id, {
          user_id: user.id,
          total_hours: Math.round(totalHours * 10) / 10,
          last_login: lastLogin,
          screenshots_today: todayScreenshots ? todayScreenshots.length : 0,
          avg_activity_level: Math.round(avgActivityLevel),
          productive_hours_week: Math.round(productiveHoursWeek * 10) / 10,
          last_screenshot: lastScreenshotTime ?? null,
          agent_version: agentVersion // Add agent version to summary
        });
      }

      setUserActivitySummaries(summaries);
    } catch (error) {
      console.error('Error fetching user activity summaries:', error);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      setLoadingProfile(true);
      
      // Get basic user info
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      // Get activity summary
      const activitySummary = userActivitySummaries.get(userId) || {
        user_id: userId,
        total_hours: 0,
        last_login: null,
        screenshots_today: 0,
        avg_activity_level: 0,
        productive_hours_week: 0,
        last_screenshot: null
      };

      // Get recent activity (last 7 days)
      const sevenDaysAgo = subDays(new Date(), 7);
      const recentActivity = [];
      
      for (let i = 0; i < 7; i++) {
        const date = subDays(new Date(), i);
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Get time logs for this day
        const { data: dayTimeLogs } = await supabase
          .from('time_logs')
          .select('start_time, end_time')
          .eq('user_id', userId)
          .gte('start_time', startOfDay.toISOString())
          .lte('start_time', endOfDay.toISOString())
          .not('end_time', 'is', null);

        // Get screenshots for this day
        const { data: dayScreenshots } = await supabase
          .from('screenshots')
          .select('activity_percent')
          .eq('user_id', userId)
          .gte('captured_at', startOfDay.toISOString())
          .lte('captured_at', endOfDay.toISOString());

        const hoursWorked = (dayTimeLogs || []).reduce((sum, log) => {
          if (log.end_time) {
            return sum + calculateSessionHours(log.start_time, log.end_time);
          }
          return sum;
        }, 0);

        const avgActivity = dayScreenshots && dayScreenshots.length > 0
          ? dayScreenshots.reduce((sum, shot) => sum + (shot.activity_percent || 0), 0) / dayScreenshots.length
          : 0;

        recentActivity.push({
          date: format(date, 'yyyy-MM-dd'),
          hours_worked: Math.round(hoursWorked * 10) / 10,
          avg_activity: Math.round(avgActivity),
          screenshots_count: dayScreenshots ? dayScreenshots.length : 0
        });
      }

      // Get productivity trends (last 4 weeks)
      const productivityTrends = [];
      for (let i = 0; i < 4; i++) {
        const weekStart = subDays(new Date(), i * 7);
        const weekEnd = subDays(new Date(), (i - 1) * 7);
        
        const { data: weekLogs } = await supabase
          .from('time_logs')
          .select('start_time, end_time')
          .eq('user_id', userId)
          .gte('start_time', weekStart.toISOString())
          .lte('start_time', weekEnd.toISOString())
          .not('end_time', 'is', null);

        const hoursWorked = (weekLogs || []).reduce((sum, log) => {
          if (log.end_time) {
            return sum + calculateSessionHours(log.start_time, log.end_time);
          }
          return sum;
        }, 0);

        productivityTrends.push({
          week: format(weekStart, 'MMM dd'),
          productivity_score: Math.min(100, Math.round((hoursWorked / 40) * 100)), // Assuming 40h/week target
          hours_worked: Math.round(hoursWorked * 10) / 10
        });
      }

      setSelectedUserProfile({
        basic_info: userData as any,
        activity_summary: activitySummary,
        recent_activity: recentActivity.reverse(),
        productivity_trends: productivityTrends.reverse()
      });

      setIsProfileDialogOpen(true);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast({
        title: "Error",
        description: "Failed to load user profile",
        variant: "destructive",
      });
    } finally {
      setLoadingProfile(false);
    }
  };

  // Role color mapping
  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "destructive";
      case "manager":
        return "default";
      default:
        return "secondary";
    }
  };

  // Delete user handling
  const handleDeleteClick = (userId: string) => {
    setSelectedUserId(userId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUserId) return;

    try {
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", selectedUserId);

      if (error) {
        throw error;
      }

      await fetchUsers(); // Refresh the list
      toast({
        title: "User deleted",
        description: "The user has been successfully deleted.",
      });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error deleting user",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setSelectedUserId(null);
    }
  };

  // Pause user handling
  const handlePauseClick = (userId: string) => {
    setSelectedUserId(userId);
    setPauseReason("");
    setIsPauseDialogOpen(true);
  };

  const handlePauseUser = async () => {
    if (!selectedUserId || !userDetails?.id) return;

    try {
      const { error } = await supabase.rpc('pause_user', {
        target_user_id: selectedUserId,
        admin_user_id: userDetails.id,
        reason: pauseReason || 'Administrative action'
      });

      if (error) {
        throw error;
      }

      await fetchUsers(); // Refresh the list
      toast({
        title: "User paused",
        description: "The user has been successfully paused.",
      });
    } catch (error: any) {
      console.error("Error pausing user:", error);
      toast({
        title: "Error pausing user",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPauseDialogOpen(false);
      setSelectedUserId(null);
      setPauseReason("");
    }
  };

  // Unpause user handling
  const handleUnpauseUser = async (userId: string) => {
    if (!userDetails?.id) return;

    try {
      const { error } = await supabase.rpc('unpause_user', {
        target_user_id: userId,
        admin_user_id: userDetails.id
      });

      if (error) {
        throw error;
      }

      await fetchUsers(); // Refresh the list
      toast({
        title: "User activated",
        description: "The user has been successfully activated.",
      });
    } catch (error: any) {
      console.error("Error activating user:", error);
      toast({
        title: "Error activating user",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Check if current user is admin
  const canManageUsers = userDetails?.role === "admin";

  // Pagination helpers
  const getPaginatedUsers = (users: User[], page: number) => {
    const startIndex = (page - 1) * USERS_PER_PAGE;
    const endIndex = startIndex + USERS_PER_PAGE;
    return users.slice(startIndex, endIndex);
  };

  const getTotalPages = (users: User[]) => {
    return Math.ceil(users.length / USERS_PER_PAGE);
  };

  const renderPagination = (users: User[], currentPage: number, setPage: (page: number) => void) => {
    const totalPages = getTotalPages(users);
    if (totalPages <= 1) return null;

    const pageNumbers: number[] = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return (
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="text-sm text-muted-foreground">
          Showing {((currentPage - 1) * USERS_PER_PAGE) + 1} to {Math.min(currentPage * USERS_PER_PAGE, users.length)} of {users.length} users
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          {startPage > 1 && (
            <>
              <Button
                variant={currentPage === 1 ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(1)}
              >
                1
              </Button>
              {startPage > 2 && <span className="px-2 text-muted-foreground">...</span>}
            </>
          )}
          
          {pageNumbers.map(pageNum => (
            <Button
              key={pageNum}
              variant={currentPage === pageNum ? "default" : "outline"}
              size="sm"
              onClick={() => setPage(pageNum)}
            >
              {pageNum}
            </Button>
          ))}
          
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="px-2 text-muted-foreground">...</span>}
              <Button
                variant={currentPage === totalPages ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(totalPages)}
              >
                {totalPages}
              </Button>
            </>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const renderUserTable = (users: User[], isActive: boolean, currentPage: number, setPage: (page: number) => void) => {
    const paginatedUsers = getPaginatedUsers(users, currentPage);
    
    return (
      <>
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Full Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Salary</TableHead>
            <TableHead>Activity Summary</TableHead>
            {!isActive && <TableHead>Paused Info</TableHead>}
            <TableHead>Last Activity</TableHead>
            <TableHead>Agent Version</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedUsers.map((user) => {
            const activitySummary = userActivitySummaries.get(user.id);
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {user.full_name || 'No Name'}
                  </div>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={getRoleBadgeVariant(user.role)}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.salary_amount ? `$${user.salary_amount.toLocaleString()}` : 'Not set'}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-blue-500" />
                        <span className="font-medium">{activitySummary?.total_hours || 0}h</span>
                        <span className="text-muted-foreground">total</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity className="h-3 w-3 text-green-500" />
                        <span className="font-medium">{activitySummary?.avg_activity_level || 0}%</span>
                        <span className="text-muted-foreground">today</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activitySummary?.last_login ? (
                        <>Last login: {formatDistanceToNow(new Date(activitySummary.last_login), { addSuffix: true })}</>
                      ) : (
                        'Never logged in'
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 text-xs"
                      onClick={() => fetchUserProfile(user.id)}
                      disabled={loadingProfile}
                    >
                      <BarChart3 className="h-3 w-3 mr-1" />
                      View Profile
                    </Button>
                  </div>
                </TableCell>
                {!isActive && (
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {user.paused_at && (
                        <div>
                          <div>Paused: {format(new Date(user.paused_at), 'PPp')}</div>
                          {user.pause_reason && (
                            <div className="text-xs">Reason: {user.pause_reason}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    {user.last_activity ? (
                      formatDistanceToNow(new Date(user.last_activity), { addSuffix: true })
                    ) : (
                      'No activity'
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {activitySummary?.agent_version ? (
                      (() => {
                        const version = activitySummary.agent_version;
                        const versionParts = version.split('.').map(Number);
                        // Latest version is 1.0.128 - highlight anything older
                        const isOutdated = versionParts[0] < 1 || 
                          (versionParts[0] === 1 && versionParts[1] === 0 && versionParts[2] < 128);
                        return (
                          <Badge 
                            variant={isOutdated ? "destructive" : "outline"} 
                            className={`font-mono ${isOutdated ? 'bg-red-100 text-red-700 border-red-300' : ''}`}
                            title={isOutdated ? 'Outdated - needs update to v1.0.128+' : 'Up to date'}
                          >
                            v{version}
                            {isOutdated && ' ⚠️'}
                      </Badge>
                        );
                      })()
                    ) : (
                      <Badge variant="secondary" className="text-amber-600 border-amber-300">
                        Unknown
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {isActive && canManageUsers ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePauseClick(user.id)}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : !isActive && canManageUsers ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnpauseUser(user.id)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm">No actions</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
    {renderPagination(users, currentPage, setPage)}
    </>
  );
  };

  return (
    <>
      <PageHeader 
        title="User Management" 
        subtitle="Manage employee accounts, pause inactive users, and control access." 
        data-testid="users-page-header"
      />
      
      <Card data-testid="users-main-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Employee Management
            </CardTitle>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>{activeUsers.length} Active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>{inactiveUsers.length} Paused</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Clock className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p>Loading users...</p>
              </div>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); if (tab === 'active') setActivePage(1); else setInactivePage(1); }} data-testid="users-tabs">
              <TabsList className="grid w-full grid-cols-2" data-testid="users-tabs-list">
                <TabsTrigger value="active" className="flex items-center gap-2" data-testid="active-users-tab">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Active Users ({activeUsers.length})
                </TabsTrigger>
                <TabsTrigger value="inactive" className="flex items-center gap-2" data-testid="paused-users-tab">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  Paused Users ({inactiveUsers.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-6" data-testid="active-users-content">
                {activeUsers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500" data-testid="no-active-users-message">
                    No active users found
                  </div>
                ) : (
                  renderUserTable(activeUsers, true, activePage, setActivePage)
                )}
              </TabsContent>
              <TabsContent value="inactive" className="mt-6" data-testid="paused-users-content">
                {inactiveUsers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500" data-testid="no-paused-users-message">
                    No paused users found
                  </div>
                ) : (
                  renderUserTable(inactiveUsers, false, inactivePage, setInactivePage)
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be
              undone and will remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser}>
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pause User Dialog */}
      <Dialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Pause User Account</DialogTitle>
            <DialogDescription>
              This will deactivate the user account and prevent them from accessing the system.
              You can reactivate them later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pause-reason">Reason for pausing (optional)</Label>
              <Textarea
                id="pause-reason"
                placeholder="e.g., Employee on leave, Performance review, etc."
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsPauseDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handlePauseUser} className="text-orange-600">
              <Pause className="h-4 w-4 mr-1" />
              Pause User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Profile Dialog */}
      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>User Profile: {selectedUserProfile?.basic_info.full_name || 'Loading...'}</DialogTitle>
            <DialogDescription>
              Detailed information and activity history for {selectedUserProfile?.basic_info.full_name || 'this user'}.
            </DialogDescription>
          </DialogHeader>
          {loadingProfile ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Clock className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p>Loading user profile...</p>
              </div>
            </div>
          ) : selectedUserProfile ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Basic Info</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">Name:</span>
                    <span>{selectedUserProfile.basic_info.full_name || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">Email:</span>
                    <span>{selectedUserProfile.basic_info.email || 'N/A'}</span>
                  </div>
                                     <div className="flex items-center gap-2">
                     <Badge variant={getRoleBadgeVariant(selectedUserProfile.basic_info.role)}>
                       <Shield className="h-4 w-4 mr-1" />
                       {selectedUserProfile.basic_info.role}
                     </Badge>
                   </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">Joined:</span>
                    <span>{selectedUserProfile.basic_info.created_at ? format(new Date(selectedUserProfile.basic_info.created_at), 'MMM dd, yyyy') : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">Last Login:</span>
                    <span>{selectedUserProfile.basic_info.last_sign_in_at ? format(new Date(selectedUserProfile.basic_info.last_sign_in_at), 'MMM dd, yyyy HH:mm') : 'Never'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Activity Summary</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Total Hours Worked:</span>
                    <span>{selectedUserProfile.activity_summary.total_hours || 0}h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Average Activity Level:</span>
                    <span>{selectedUserProfile.activity_summary.avg_activity_level || 0}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-500" />
                    <span className="font-medium">Productive Hours This Week:</span>
                    <span>{selectedUserProfile.activity_summary.productive_hours_week || 0}h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">Last Screenshot:</span>
                    <span>{selectedUserProfile.activity_summary.last_screenshot ? format(new Date(selectedUserProfile.activity_summary.last_screenshot), 'MMM dd, HH:mm') : 'Never'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg col-span-full md:col-span-1">
                <h3 className="text-lg font-semibold mb-2">Recent Activity</h3>
                <div className="space-y-3">
                  {selectedUserProfile.recent_activity.map((item, index) => (
                    <div key={index} className="bg-white p-3 rounded-md shadow-sm">
                      <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>{item.date}</span>
                        <span>{item.hours_worked}h</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                        <Activity className="h-3 w-3" />
                        <span>Avg: {item.avg_activity}%</span>
                        <span>Screenshots: {item.screenshots_count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg col-span-full md:col-span-1">
                <h3 className="text-lg font-semibold mb-2">Productivity Trends</h3>
                <div className="space-y-3">
                  {selectedUserProfile.productivity_trends.map((item, index) => (
                    <div key={index} className="bg-white p-3 rounded-md shadow-sm">
                      <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>{item.week}</span>
                        <span>{item.productivity_score}%</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                        <TrendingUp className="h-3 w-3" />
                        <span>Hours: {item.hours_worked}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No user profile data available.
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsProfileDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UsersPage;
