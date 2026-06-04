import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchDetailedTimeLogs } from '@/domains/time/services/time-logs.service';
import { backendPatch } from '@/lib/backend-api';
import { fetchOrgUsers, fetchProjects as fetchProjectsApi } from '@/domains/people';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/providers/auth-provider';
import { format, differenceInMinutes, subMonths, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Clock, Calendar, Download, Filter, Search, Play, Square, RefreshCw, Database, AlertTriangle, X } from 'lucide-react';

interface TimeLog {
  id: string;
  user_id: string;
  project_id: string | null;
  start_time: string;
  end_time: string | null;
  // Joined data from users and projects tables
  users?: {
    id: string;
    email: string;
    full_name?: string;
    organization_id?: string | null;
  } | null;
  projects?: {
    id: string;
    name: string;
  } | null;
  [key: string]: any;
}

interface User {
  id: string;
  email: string;
  full_name?: string;
  organization_id?: string | null;
}

interface Project {
  id: string;
  name: string;
}



export default function TimeLogs() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);


  useEffect(() => {
    if (userDetails?.role === 'admin') {
      fetchTimeLogs();
      fetchUsers();
      fetchProjects();
      
      // Auto-refresh every 30 seconds to show real-time updates
      const interval = setInterval(fetchTimeLogs, 30000);
      return () => clearInterval(interval);
    }
  }, [userDetails, organizationId, isSuperAdmin]);

  // Refetch when date filter changes
  useEffect(() => {
    if (userDetails?.role === 'admin') {
      fetchTimeLogs();
    }
  }, [dateFilter, organizationId, isSuperAdmin, customStartDate, customEndDate]);

  const fetchTimeLogs = async () => {
    try {
      setLoading(true);

      const ctx = { organizationId, isSuperAdmin };
      const range = dateFilter !== 'all' ? getDateFilterRange() : null;
      const start = range?.start ?? new Date(0);
      const end = range?.end ?? new Date();

      const data = await fetchDetailedTimeLogs(start, end, ctx, { limit: 10000 });
      setLogs(data as TimeLog[]);
    } catch (error) {
      console.error('Error fetching time logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await fetchOrgUsers(
        { organizationId, isSuperAdmin },
        { excludeTestEmails: true },
      );
      setUsers(
        data
          .filter((u) => !u.full_name?.toUpperCase().includes('TEST'))
          .map((u) => ({
            id: u.id,
            email: u.email,
            full_name: u.full_name,
            organization_id: u.organization_id,
          })),
      );
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await fetchProjectsApi({ organizationId, isSuperAdmin });
      setProjects(
        data
          .filter(
            (p) =>
              !p.name?.toLowerCase().includes('test-') &&
              !p.description?.toLowerCase().includes('e2e testing'),
          )
          .map((p) => ({ id: p.id, name: p.name })),
      );
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const getDateFilterRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'yesterday': {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      }
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        return { start: startOfDay(weekStart), end: endOfDay(now) };
      }
      case 'month': {
        const monthStart = new Date(now);
        monthStart.setDate(monthStart.getDate() - 30);
        return { start: startOfDay(monthStart), end: endOfDay(now) };
      }
      case 'last-month': {
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      }
      case 'custom':
        if (customStartDate && customEndDate) {
          return { start: startOfDay(customStartDate), end: endOfDay(customEndDate) };
        }
        return null;
      default:
        return null;
    }
  };

  const filteredLogs = logs.filter((log: any) => {
    // Use joined data from the log itself
    const user = log.users;
    const project = log.projects;
    
    // Apply user filter
    if (userFilter !== 'all' && log.user_id !== userFilter) return false;
    
    // Apply project filter
    if (projectFilter !== 'all' && log.project_id !== projectFilter) return false;
    
    // Apply search term
    if (searchTerm) {
      const userMatch = user && (
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      const projectMatch = project && project.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      return userMatch || projectMatch;
    }
    
    return true;
  });

  const calculateDuration = (startTime: string, endTime: string | null) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const minutes = differenceInMinutes(end, start);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    // Handle zero-duration sessions
    if (minutes === 0 && endTime) {
      return '< 1m';
    }
    
    const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return endTime ? durationText : `${durationText} (active)`;
  };

  // Check if session is potentially stuck (active for more than 12 hours)
  const isStuckSession = (startTime: string, endTime: string | null) => {
    if (endTime) return false;
    const hours = differenceInMinutes(new Date(), new Date(startTime)) / 60;
    return hours > 12;
  };

  // Close orphaned session
  const closeOrphanedSession = async (logId: string) => {
    try {
      await backendPatch(`/data/time-logs/${logId}`, {
        end_time: new Date().toISOString(),
      });
      fetchTimeLogs();
    } catch (error) {
      console.error('Error closing session:', error);
    }
  };

  const getActiveSessions = () => {
    return filteredLogs.filter(log => !log.end_time);
  };

  const getCompletedSessions = () => {
    return filteredLogs.filter(log => log.end_time);
  };

  if (userDetails?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  const activeSessions = getActiveSessions();
  const completedSessions = getCompletedSessions();

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button onClick={fetchTimeLogs} disabled={loading} className="flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{activeSessions.length}</div>
              <div className="text-sm text-muted-foreground">Active Sessions</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{completedSessions.length}</div>
              <div className="text-sm text-muted-foreground">Completed Sessions</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{filteredLogs.length}</div>
              <div className="text-sm text-muted-foreground">Total Sessions</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Search users or projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>
            
            <EmployeeFilterCombobox
              value={userFilter}
              onValueChange={setUserFilter}
              users={users}
              placeholder="Filter by user"
              className="w-48"
            />

            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((project: any) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={(value) => {
              setDateFilter(value);
              if (value === 'custom') setCustomPickerOpen(true);
            }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="custom">Custom Dates</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === 'custom' && (
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
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions First (if any) */}
      {activeSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-green-600" />
              Active Sessions ({activeSessions.length})
            </CardTitle>
            <CardDescription>
              Currently running time tracking sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Start Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSessions.map((log: any) => {
                    const stuck = isStuckSession(log.start_time, log.end_time);
                    return (
                      <TableRow key={log.id} className={stuck ? "bg-red-50" : "bg-green-50"}>
                        <TableCell>
                          {log.users?.full_name || log.users?.email || 'Unknown User'}
                        </TableCell>
                        <TableCell>
                          {log.projects?.name || 'No Project'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(log.start_time), 'MMM dd, yyyy HH:mm')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={stuck ? "destructive" : "secondary"}>
                            {calculateDuration(log.start_time, null)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {stuck ? (
                              <>
                                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Stuck
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-red-600 hover:bg-red-50"
                                  onClick={() => closeOrphanedSession(log.id)}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Close
                                </Button>
                              </>
                            ) : (
                              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                                <Play className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Time Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Time Logs ({filteredLogs.length})
          </CardTitle>
          <CardDescription>
            Detailed view of employee time tracking entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading time logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <Database className="h-8 w-8 text-muted-foreground/50" />
                <div>No time logs found matching your filters.</div>
                <div className="text-sm">
                  Try changing the date filter or check if employees have been tracking time.
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  {filteredLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {log.users?.full_name || log.users?.email || 'Unknown User'}
                      </TableCell>
                      <TableCell>
                        {log.projects?.name || 'No Project'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(log.start_time), 'MMM dd, yyyy HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.end_time ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(log.end_time), 'MMM dd, yyyy HH:mm')}
                          </div>
                        ) : (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Play className="h-3 w-3" />
                            In Progress
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {calculateDuration(log.start_time, log.end_time)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.end_time ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            Completed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
