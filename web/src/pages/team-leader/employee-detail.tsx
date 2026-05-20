import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { calculateSessionHours } from '@/lib/time-utils';
import { ArrowLeft, Clock, Camera, Monitor, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

interface TimeLog {
  id: string;
  start_time: string;
  end_time: string | null;
  project_id: string | null;
}

interface Screenshot {
  id: string;
  captured_at: string;
  file_path: string | null;
  activity_percent: number | null;
}

interface EmployeeInfo {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
}

export default function TeamLeaderEmployeeDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { userDetails } = useAuth();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (userId && userDetails?.id) {
      checkAuthorizationAndFetch();
    }
  }, [userId, userDetails?.id]);

  const checkAuthorizationAndFetch = async () => {
    if (!userId || !userDetails?.id) return;

    try {
      setLoading(true);

      // Verify this employee is assigned to the current team leader
      const { data: assignment, error: authError } = await supabase
        .from('team_leader_assignments')
        .select('id')
        .eq('team_leader_id', userDetails.id)
        .eq('employee_id', userId)
        .maybeSingle();

      if (authError) throw authError;

      if (!assignment) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      // Fetch employee info
      const { data: empData, error: empError } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('id', userId)
        .single();

      if (empError) throw empError;
      setEmployee(empData);

      // Fetch today's data
      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();

      // Time logs for today
      const { data: logs, error: logsError } = await supabase
        .from('time_logs')
        .select('id, start_time, end_time, project_id')
        .eq('user_id', userId)
        .gte('start_time', dayStart)
        .lt('start_time', dayEnd)
        .order('start_time', { ascending: false });

      if (logsError) throw logsError;
      setTimeLogs(logs || []);

      // Screenshots for today
      const { data: shots, error: shotsError } = await supabase
        .from('screenshots')
        .select('id, captured_at, file_path, activity_percent')
        .eq('user_id', userId)
        .gte('captured_at', dayStart)
        .lt('captured_at', dayEnd)
        .order('captured_at', { ascending: false })
        .limit(20);

      if (shotsError) throw shotsError;
      setScreenshots(shots || []);
    } catch (error: any) {
      console.error('Error fetching employee detail:', error);
      toast({
        title: 'Error loading employee data',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="space-y-4">
        <PageHeader title="Access Denied" subtitle="You are not authorized to view this employee's data." />
        <Button variant="outline" onClick={() => navigate('/team-leader')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const totalHoursToday = timeLogs.reduce(
    (sum, log) => sum + calculateSessionHours(log.start_time, log.end_time),
    0
  );
  const isOnline = timeLogs.some(log => !log.end_time);
  const avgActivity = screenshots.length > 0
    ? Math.round(screenshots.reduce((sum, s) => sum + (s.activity_percent || 0), 0) / screenshots.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={employee?.full_name || employee?.email || 'Employee'}
        subtitle={employee?.email}
      >
        <Button variant="outline" onClick={() => navigate('/team-leader')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </PageHeader>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hours Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHoursToday.toFixed(1)}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={isOnline ? 'default' : 'secondary'}>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Activity</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgActivity}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Time Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {timeLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No sessions recorded today</p>
          ) : (
            <div className="space-y-2">
              {timeLogs.map(log => {
                const duration = calculateSessionHours(log.start_time, log.end_time);
                return (
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-md border">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${log.end_time ? 'bg-gray-300' : 'bg-green-500'}`} />
                      <span className="text-sm">
                        {format(new Date(log.start_time), 'HH:mm')}
                        {' - '}
                        {log.end_time ? format(new Date(log.end_time), 'HH:mm') : 'Active'}
                      </span>
                    </div>
                    <span className="text-sm font-medium">{duration.toFixed(1)}h</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Screenshots */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Screenshots</CardTitle>
        </CardHeader>
        <CardContent>
          {screenshots.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No screenshots captured today</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {screenshots.map(shot => (
                <div key={shot.id} className="space-y-1">
                  {shot.file_path ? (
                    <img
                      src={shot.file_path}
                      alt={`Screenshot at ${format(new Date(shot.captured_at), 'HH:mm')}`}
                      className="w-full h-auto rounded-md border"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted rounded-md border flex items-center justify-center">
                      <Camera className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{format(new Date(shot.captured_at), 'HH:mm')}</span>
                    {shot.activity_percent != null && (
                      <span>{shot.activity_percent}%</span>
                    )}
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
