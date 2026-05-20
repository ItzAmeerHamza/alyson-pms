import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import {
  fetchTimeLogs,
  fetchDetailedTimeLogs,
  computeTimeLogStats,
} from '../services/time-logs.service';

export function useTimeLogs(start: Date, end: Date, enabled = true) {
  const { userDetails, isSuperAdmin } = useAuth();

  return useQuery({
    queryKey: ['time-logs', start.toISOString(), end.toISOString(), userDetails?.organization_id],
    queryFn: () =>
      fetchTimeLogs(start, end, {
        organizationId: userDetails?.organization_id,
        isSuperAdmin,
      }),
    enabled: enabled && !!userDetails,
    staleTime: 30_000,
  });
}

export function useDetailedTimeLogs(start: Date, end: Date, enabled = true) {
  const { userDetails, isSuperAdmin } = useAuth();

  return useQuery({
    queryKey: ['time-logs-detailed', start.toISOString(), end.toISOString(), userDetails?.organization_id],
    queryFn: () =>
      fetchDetailedTimeLogs(start, end, {
        organizationId: userDetails?.organization_id,
        isSuperAdmin,
      }),
    enabled: enabled && !!userDetails,
    staleTime: 30_000,
  });
}

export { computeTimeLogStats };
