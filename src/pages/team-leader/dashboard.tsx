import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useTeamLeaderAssignments } from '@/hooks/use-team-leader';
import { calculateSessionHours } from '@/lib/time-utils';
import { Users, Clock, Activity, Eye, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface MemberStats {
  userId: string;
  fullName: string;
  email: string;
  todayHours: number;
  isOnline: boolean;
  lastActivity: string | null;
}

export default function TeamLeaderDashboard() {
  const { userDetails } = useAuth();
  const { assignments, loading: assignmentsLoading } = useTeamLeaderAssignments(userDetails?.id);
  const [memberStats, setMemberStats] = useState<MemberStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (assignments.length > 0) {
      fetchMemberStats();
    } else if (!assignmentsLoading) {
      setMemberStats([]);
    }
  }, [assignments]);

  const fetchMemberStats = async () => {
    setLoadingStats(true);
    try {
      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();
      const employeeIds = assignments.map(a => a.employee_id);

      // Fetch today's time logs for all team members
      const { data: timeLogs, error: tlError } = await supabase
        .from('time_logs')
        .select('user_id, start_time, end_time')
        .in('user_id', employeeIds)
        .gte('start_time', dayStart)
        .lt('start_time', dayEnd);

      if (tlError) throw tlError;

      // Calculate hours per user
      const hoursMap: Record<string, number> = {};
      const lastActivityMap: Record<string, string | null> = {};

      (timeLogs || []).forEach(log => {
        const hours = calculateSessionHours(log.start_time, log.end_time);
        hoursMap[log.user_id] = (hoursMap[log.user_id] || 0) + hours;

        const logTime = log.end_time || log.start_time;
        if (!lastActivityMap[log.user_id] || logTime > lastActivityMap[log.user_id]!) {
          lastActivityMap[log.user_id] = logTime;
        }
      });

      // Check who is currently online (has an active session with no end_time)
      const onlineSet = new Set<string>();
      (timeLogs || []).forEach(log => {
        if (!log.end_time) onlineSet.add(log.user_id);
      });

      const stats: MemberStats[] = assignments.map(a => ({
        userId: a.employee_id,
        fullName: a.employee?.full_name || 'Unknown',
        email: a.employee?.email || '',
        todayHours: Math.round((hoursMap[a.employee_id] || 0) * 100) / 100,
        isOnline: onlineSet.has(a.employee_id),
        lastActivity: lastActivityMap[a.employee_id] || null,
      }));

      // Sort: online first, then by hours descending
      stats.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return b.todayHours - a.todayHours;
      });

      setMemberStats(stats);
    } catch (error: any) {
      console.error('Error fetching member stats:', error);
      toast({
        title: 'Error loading team stats',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const totalHoursToday = memberStats.reduce((sum, m) => sum + m.todayHours, 0);
  const onlineCount = memberStats.filter(m => m.isOnline).length;
  const loading = assignmentsLoading || loadingStats;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Dashboard"
        subtitle={`Managing ${assignments.length} team member${assignments.length !== 1 ? 's' : ''}`}
      >
        <Button variant="outline" onClick={fetchMemberStats} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Now</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHoursToday.toFixed(1)}h</div>
          </CardContent>
        </Card>
      </div>

      {/* Team Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : memberStats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No team members assigned yet. Contact your admin to assign employees to your team.
            </p>
          ) : (
            <div className="space-y-3">
              {memberStats.map(member => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${member.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium">{member.fullName}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">{member.todayHours.toFixed(1)}h today</p>
                      {member.lastActivity && (
                        <p className="text-xs text-muted-foreground">
                          Last: {format(new Date(member.lastActivity), 'HH:mm')}
                        </p>
                      )}
                    </div>
                    <Badge variant={member.isOnline ? 'default' : 'secondary'}>
                      {member.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/team-leader/employee/${member.userId}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
