
import React, { useState, useEffect } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface IdleLog {
  id: string;
  user_id: string;
  idle_start: string;
  idle_end: string | null;
  duration_seconds: number | null;
  created_at: string;
}

// Helper function to format duration with proper hour handling
const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return 'Ongoing';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

const IdleTimePage = () => {
  const { user, userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [idleLogs, setIdleLogs] = useState<IdleLog[]>([]);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    fetchIdleLogs();
  }, [user, startDate, endDate]);

  const fetchIdleLogs = async () => {
    if (!user?.id) return;

    const startDateObj = startOfDay(new Date(startDate));
    const endDateObj = endOfDay(new Date(endDate));

    let idleQuery = supabase
      .from('idle_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('idle_start', startDateObj.toISOString())
      .lte('idle_start', endDateObj.toISOString())
      .order('idle_start', { ascending: false });
    if (organizationId && !isSuperAdmin) {
      idleQuery = idleQuery.eq('organization_id', organizationId);
    }
    const { data: idleLogsData, error: idleLogsError } = await idleQuery;

    if (idleLogsError) {
      console.error('Error fetching idle logs:', idleLogsError);
      return;
    }

    // Map database fields to interface - using correct schema column names
    const mappedLogs: IdleLog[] = (idleLogsData || []).map(log => ({
      id: log.id,
      user_id: log.user_id,
      idle_start: log.idle_start,
      idle_end: log.idle_end,
      duration_seconds: log.duration_seconds,
      created_at: log.created_at || log.idle_start
    }));

    setIdleLogs(mappedLogs);
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Idle Time Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center space-x-4">
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-500" />
                </div>
                <Input
                  type="date"
                  id="start-date"
                  className="pl-10"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-500" />
                </div>
                <Input
                  type="date"
                  id="end-date"
                  className="pl-10"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {idleLogs.map((item: IdleLog) => (
              <div key={item.id} className="flex justify-between items-center">
                <span className="text-sm">{format(new Date(item.idle_start), 'HH:mm')}</span>
                <span className="text-sm text-muted-foreground">
                  {formatDuration(item.duration_seconds)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IdleTimePage;
