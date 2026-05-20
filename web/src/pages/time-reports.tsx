import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/components/ui/use-toast';
import { format, subDays, parseISO, startOfDay, endOfDay } from 'date-fns';
import { mergeTimeIntervals, getSmartEndMs, type TimeInterval } from '@/lib/time-utils';
import { Calendar, Clock, Download, Filter, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// TimeReports module - optimized for performance

interface TimeReport {
  id: string;
  user_id: string;
  project_id: string | null; // Updated to allow null
  start_time: string;
  end_time: string | null;
  is_idle: boolean;
  idle_seconds?: number;
  user_name?: string;
  user_email?: string;
  project_name?: string;
  smart_end_ms?: number; // Smart-capped end time based on screenshots
}

interface User {
  id: string;
  full_name: string;
  email: string;
}

interface Project {
  id: string;
  name: string;
}

export default function TimeReports() {
  const [reports, setReports] = useState<TimeReport[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    userId: 'all',
    projectId: 'all',
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    includeIdle: true
  });

  const { user, userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const { toast } = useToast();

  // Memoize filter string to prevent unnecessary re-renders
  const filtersKey = useMemo(() => 
    JSON.stringify(filters), 
    [filters.userId, filters.projectId, filters.startDate, filters.endDate, filters.includeIdle]
  );

  const fetchUsers = useCallback(async () => {
    try {
      let query = supabase
        .from('users')
        .select('id, full_name, email')
        .order('full_name');

      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch users',
        variant: 'destructive',
      });
    }
  }, [toast, organizationId, isSuperAdmin]);

  const fetchProjects = useCallback(async () => {
    try {
      let query = supabase
        .from('projects')
        .select('id, name')
        .order('name');

      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch projects',
        variant: 'destructive',
      });
    }
  }, [toast, organizationId, isSuperAdmin]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = startOfDay(new Date(filters.startDate));
      const endDate = endOfDay(new Date(filters.endDate));

      // Build query with organization filter through users relation
      // Use !inner join to filter time_logs by organization_id on users table
      let query = supabase
        .from('time_logs')
        .select(`
          *,
          users!inner(id, full_name, email, organization_id),
          projects(id, name)
        `)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString());

      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('users.organization_id', organizationId);
      }

      if (filters.userId && filters.userId !== 'all') {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.projectId && filters.projectId !== 'all') {
        query = query.eq('project_id', filters.projectId);
      }

      if (!filters.includeIdle) {
        query = query.eq('is_idle', false);
      }

      const timeLogData = await fetchPaginated<any>(
        query.order('start_time', { ascending: false })
      );

      if (!timeLogData || timeLogData.length === 0) {
        setReports([]);
        return;
      }

      // Fetch screenshots for smart session capping
      let ssQuery = supabase
        .from('screenshots')
        .select('user_id, captured_at')
        .gte('captured_at', startDate.toISOString())
        .lte('captured_at', endDate.toISOString());
      if (organizationId && !isSuperAdmin) {
        // screenshots are scoped by the user filter or org users
      }
      if (filters.userId && filters.userId !== 'all') {
        ssQuery = ssQuery.eq('user_id', filters.userId);
      }
      const { data: ssData } = await ssQuery;

      // Build per-user sorted screenshot timestamps
      const userSsTimes: { [uid: string]: number[] } = {};
      (ssData || []).forEach((ss: any) => {
        if (!ss.user_id) return;
        if (!userSsTimes[ss.user_id]) userSsTimes[ss.user_id] = [];
        userSsTimes[ss.user_id].push(new Date(ss.captured_at).getTime());
      });
      for (const uid of Object.keys(userSsTimes)) {
        userSsTimes[uid].sort((a, b) => a - b);
      }

      // Fetch idle_logs for the same date range to compute per-session idle time
      // (idle_seconds on time_logs is not populated; real data lives in idle_logs)
      const idleLogsData = await fetchPaginated<any>(
        supabase
          .from('idle_logs')
          .select('user_id, idle_start, idle_end, duration_seconds')
          .gte('idle_start', startDate.toISOString())
          .lte('idle_start', endDate.toISOString())
      );

      const enrichedReports = timeLogData.map((report) => {
        // Calculate overlapping idle time from idle_logs for this session
        const reportStart = new Date(report.start_time).getTime();
        const reportEnd = report.end_time ? new Date(report.end_time).getTime() : Date.now();

        // Find last screenshot for smart session capping
        const ssTimes = userSsTimes[report.user_id] || [];
        let lastSsMs: number | undefined;
        for (let i = ssTimes.length - 1; i >= 0; i--) {
          if (ssTimes[i] >= reportStart && ssTimes[i] <= reportEnd) {
            lastSsMs = ssTimes[i];
            break;
          }
        }
        const smartEndMs = getSmartEndMs(reportStart, reportEnd, lastSsMs);

        let totalIdleMs = 0;
        (idleLogsData || []).forEach(idle => {
          if (idle.user_id !== report.user_id) return;
          const idleStart = new Date(idle.idle_start).getTime();
          const idleEnd = idle.idle_end ? new Date(idle.idle_end).getTime() : Date.now();
          // Calculate overlap between idle period and this session (using smart end)
          const overlapStart = Math.max(reportStart, idleStart);
          const overlapEnd = Math.min(smartEndMs, idleEnd);
          if (overlapStart < overlapEnd) {
            totalIdleMs += (overlapEnd - overlapStart);
          }
        });

        return {
          ...report,
          idle_seconds: Math.round(totalIdleMs / 1000),
          smart_end_ms: smartEndMs,
          user_name: (report as any).users?.full_name || 'Unknown User',
          user_email: (report as any).users?.email || 'Unknown',
          project_name: (report as any).projects?.name || 'Unknown Project'
        };
      });

      setReports(enrichedReports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch time reports',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filters, toast, organizationId, isSuperAdmin]);

  // Initial data fetch
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        await Promise.all([fetchUsers(), fetchProjects()]);
        await fetchReports();
      } catch (error) {
        console.error('Error during component initialization:', error);
      }
    };

    initializeComponent();
  }, [fetchUsers, fetchProjects, fetchReports]);

  // Re-fetch reports when filters change (but not on initial mount)
  useEffect(() => {
    if (users.length > 0 && projects.length > 0) {
      fetchReports();
    }
  }, [filtersKey, users.length, projects.length, fetchReports]);

  const calculateDuration = (start: string, end: string | null, _idleSeconds?: number, smartEndMs?: number): string => {
    if (!end && !smartEndMs) return 'Ongoing';

    const startMs = new Date(start).getTime();
    const endMs = smartEndMs || new Date(end!).getTime();
    const diffMs = endMs - startMs;

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  };

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      if (filters.userId && filters.userId !== 'all' && report.user_id !== filters.userId) return false;
      if (filters.projectId && filters.projectId !== 'all' && report.project_id !== filters.projectId) return false;
      if (!filters.includeIdle && report.is_idle) return false;
      return true;
    });
  }, [reports, filters.userId, filters.projectId, filters.includeIdle]);

  const exportToCSV = useCallback(() => {
    try {
      const csvData = filteredReports.map((report: TimeReport) => ({
        'User': report.user_name,
        'Email': report.user_email,
        'Project': report.project_name,
        'Start Time': format(new Date(report.start_time), 'yyyy-MM-dd HH:mm:ss'),
        'End Time': report.end_time ? format(new Date(report.end_time), 'yyyy-MM-dd HH:mm:ss') : 'Ongoing',
        'Duration': calculateDuration(report.start_time, report.end_time, report.idle_seconds, (report as any).smart_end_ms),
        'Status': report.is_idle ? 'Idle' : 'Active'
      }));

      const csvHeaders = Object.keys(csvData[0] || {});
      const csvRows = csvData.map(row => 
        csvHeaders.map(header => `"${row[header as keyof typeof row] || ''}"`).join(',')
      );
      
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `time-reports-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: 'Success',
        description: 'Report exported successfully',
      });
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      toast({
        title: 'Error',
        description: 'Failed to export to CSV',
        variant: 'destructive',
      });
    }
  }, [filteredReports, filters.includeIdle, toast]);

  const getTotalHours = useMemo((): string => {
    // Group by user_id to merge overlapping multi-device sessions
    const byUser: { [userId: string]: TimeInterval[] } = {};
    filteredReports.forEach((report: any) => {
      const userId = report.user_id || 'unknown';
      if (!byUser[userId]) byUser[userId] = [];
      const start = new Date(report.start_time).getTime();
      // Use smart_end_ms if available (screenshot-capped), otherwise raw end
      const end = report.smart_end_ms || (report.end_time ? new Date(report.end_time).getTime() : Date.now());
      byUser[userId].push({ startMs: start, endMs: end });
    });

    let totalMs = 0;
    for (const intervals of Object.values(byUser)) {
      const merged = mergeTimeIntervals(intervals);
      for (const interval of merged) {
        totalMs += interval.endMs - interval.startMs;
      }
    }

    const hours = Math.floor(totalMs / (1000 * 60 * 60));
    const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }, [filteredReports]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Time Reports</h1>
        <Button onClick={exportToCSV} disabled={filteredReports.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">User</label>
              <EmployeeFilterCombobox
                value={filters.userId}
                onValueChange={(value) => setFilters(prev => ({ ...prev, userId: value }))}
                users={users}
                placeholder="All users"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <Select 
                value={filters.projectId} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, projectId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Include Idle Time</label>
              <Select 
                value={filters.includeIdle ? 'true' : 'false'} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, includeIdle: value === 'true' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{filteredReports.length}</div>
            <div className="text-sm text-gray-500">Total Sessions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{getTotalHours}</div>
            <div className="text-sm text-gray-500">Total Time</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {filteredReports.filter(r => !r.is_idle).length}
            </div>
            <div className="text-sm text-gray-500">Active Sessions</div>
          </CardContent>
        </Card>
      </div>

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle>Time Log Details</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading reports...</div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No time logs found for the selected criteria.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report: any) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{report.user_name}</div>
                        <div className="text-sm text-gray-500">{report.user_email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{report.project_name}</TableCell>
                    <TableCell>
                      {format(new Date(report.start_time), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      {report.end_time 
                        ? format(new Date(report.end_time), 'MMM d, yyyy HH:mm')
                        : 'Ongoing'
                      }
                    </TableCell>
                    <TableCell>
                      {calculateDuration(report.start_time, report.end_time, report.idle_seconds, report.smart_end_ms)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={report.is_idle ? 'secondary' : 'default'}>
                        {report.is_idle ? 'Idle' : 'Active'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
