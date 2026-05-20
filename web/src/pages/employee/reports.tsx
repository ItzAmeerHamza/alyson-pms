
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, subMonths, parseISO, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { calculateSessionHours, calculateSessionSeconds, formatDurationFromSeconds } from '@/lib/time-utils';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { fetchProjects as fetchProjectsService } from '@/domains/people';
import { Calendar, Clock, Download, Filter, Search, RefreshCw } from 'lucide-react';

interface TimeLog {
  id: string;
  start_time: string;
  end_time: string;
  user_id: string;
  project_id: string;
  projects: {
    name: string;
  };
}

interface Project {
  id: string;
  name: string;
}

export default function EmployeeReports() {
  const { userDetails, user, isSuperAdmin } = useAuth();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Organization filtering
  const organizationId = userDetails?.organization_id;

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchTimeLogs();
    
    // Add real-time auto-refresh every 30 seconds for live session updates
    const interval = setInterval(() => {
      fetchTimeLogs();
    }, 30000); // 30 seconds - fast enough to show new sessions quickly
    
    return () => clearInterval(interval);
  }, [dateRange, searchTerm, customStartDate, customEndDate]);

  // Additional useEffect for immediate refresh on focus (when user returns to tab)
  useEffect(() => {
    const handleFocus = () => {
      fetchTimeLogs();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await fetchProjectsService({ organizationId, isSuperAdmin });
      setProjects(data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchTimeLogs = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const startDate = getStartDate();
      const endDate = new Date(); // Today

      let query = supabase
        .from('time_logs')
        .select(`
          id,
          start_time,
          end_time,
          user_id,
          project_id,
          projects (name)
        `)
        .eq('user_id', user.id)
        .gte('start_time', startDate.toISOString())
        .order('start_time', { ascending: false });

      // Enhanced query to include ongoing sessions and recent sessions
      if (dateRange === 'today') {
        // For today, get all sessions that started today OR are currently active (regardless of start date)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        let todayQuery = supabase
          .from('time_logs')
          .select(`
            id,
            start_time,
            end_time,
            user_id,
            project_id,
            projects (name)
          `)
          .eq('user_id', user.id)
          .or(`start_time.gte.${todayStart.toISOString()},end_time.is.null`)
          .order('start_time', { ascending: false });
        if (organizationId && !isSuperAdmin) {
          todayQuery = todayQuery.eq('organization_id', organizationId);
        }
        const { data: timeLogsData, error: timeLogsError } = await todayQuery;

        if (timeLogsError) {
          console.error('Error fetching time logs:', timeLogsError);
          return;
        }

        // Transform the data to match our interface
        const transformedLogs: TimeLog[] = (timeLogsData || []).map((log: any) => ({
          id: log.id,
          start_time: log.start_time,
          end_time: log.end_time,
          user_id: log.user_id,
          project_id: log.project_id,
          projects: {
            name: log.projects?.name || 'Unknown Project'
          }
        }));

        setTimeLogs(transformedLogs);
      } else {
        // For other date ranges, use the original query but also include ongoing sessions
        if (searchTerm) {
          query = query.ilike('projects.name', `%${searchTerm}%`);
        }

        if (organizationId && !isSuperAdmin) {
          query = query.eq('organization_id', organizationId);
        }
        const { data: timeLogsData, error: timeLogsError } = await query
          .lte('start_time', endDate.toISOString());

        if (timeLogsError) {
          console.error('Error fetching time logs:', timeLogsError);
          return;
        }

        // Also fetch any ongoing sessions
        let ongoingQuery = supabase
          .from('time_logs')
          .select(`
            id,
            start_time,
            end_time,
            user_id,
            project_id,
            projects (name)
          `)
          .eq('user_id', user.id)
          .is('end_time', null);
        if (organizationId && !isSuperAdmin) {
          ongoingQuery = ongoingQuery.eq('organization_id', organizationId);
        }
        const { data: ongoingSessions, error: ongoingError } = await ongoingQuery;

        if (ongoingError) {
          console.error('Error fetching ongoing sessions:', ongoingError);
        }

        // Combine both datasets
        const allSessions = [...(timeLogsData || []), ...(ongoingSessions || [])];
        
        // Remove duplicates and sort
        const uniqueSessions = allSessions.filter((session, index, self) => 
          index === self.findIndex((s) => s.id === session.id)
        );

        // Transform the data to match our interface
        const transformedLogs: TimeLog[] = uniqueSessions.map((log: any) => ({
          id: log.id,
          start_time: log.start_time,
          end_time: log.end_time,
          user_id: log.user_id,
          project_id: log.project_id,
          projects: {
            name: log.projects?.name || 'Unknown Project'
          }
        })).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

        setTimeLogs(transformedLogs);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching time logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStartDate = () => {
    const today = new Date();
    switch (dateRange) {
      case 'today':
        return today;
      case 'week':
        return subDays(today, 7);
      case 'month':
        return subDays(today, 30);
      case 'last-month':
        return startOfMonth(subMonths(today, 1));
      case 'custom':
        return customStartDate || today;
      default:
        return today;
    }
  };

  const getEndDate = () => {
    const today = new Date();
    switch (dateRange) {
      case 'last-month':
        return endOfMonth(subMonths(today, 1));
      case 'custom':
        return customEndDate || today;
      default:
        return today;
    }
  };

  const calculateTotalTime = () => {
    let totalHours = 0;
    timeLogs.forEach((log) => {
      if (log.end_time) {
        totalHours += calculateSessionHours(log.start_time, log.end_time);
      }
    });
    return totalHours;
  };

  const totalHoursDecimal = calculateTotalTime();
  const totalHours = Math.floor(totalHoursDecimal);
  const totalMinutes = Math.round((totalHoursDecimal - totalHours) * 60);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Time Reports</h1>
          <p className="text-muted-foreground">Your tracked time and activity</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="flex items-center text-sm text-muted-foreground">
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Auto-refresh: 30s'}
            </div>
            <div className="text-xs text-muted-foreground">
              Last updated: {format(lastRefresh, 'HH:mm:ss')}
            </div>
          </div>
          <Button onClick={fetchTimeLogs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>View your time logs and project allocations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={dateRange} onValueChange={(value) => {
              setDateRange(value);
              if (value === 'custom') setCustomPickerOpen(true);
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">Last 30 days</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="custom">Custom Dates</SelectItem>
              </SelectContent>
            </Select>
            {dateRange === 'custom' && (
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

            <div className="flex items-center space-x-2">
              <Input
                type="text"
                placeholder="Search by project..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-xl font-semibold">
              Total Time Tracked: {totalHours} hours and {totalMinutes} minutes
            </h3>
          </div>

          <div className="overflow-x-auto mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeLogs.map((timeLog: any) => {
                  const project = projects.find((p: any) => p.id === timeLog.project_id);
                  const startTime = new Date(timeLog.start_time);
                  const endTime = timeLog.end_time ? new Date(timeLog.end_time) : null;
                  const isOngoing = !timeLog.end_time;
                  const durationSeconds = calculateSessionSeconds(timeLog.start_time, timeLog.end_time ?? null);
                  const durationDisplay = formatDurationFromSeconds(durationSeconds);

                  return (
                    <TableRow key={timeLog.id} className={isOngoing ? 'bg-green-50 border-green-200' : ''}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span>{project?.name || 'No Project'}</span>
                          {isOngoing && (
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{format(startTime, 'MMM dd, yyyy HH:mm')}</TableCell>
                      <TableCell>
                        {endTime ? format(endTime, 'MMM dd, yyyy HH:mm') : (
                          <Badge variant="outline" className="text-green-600">
                            Ongoing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span>{durationDisplay}</span>
                          {isOngoing && (
                            <RefreshCw className="h-3 w-3 text-green-600 animate-spin" />
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
    </div>
  );
}
