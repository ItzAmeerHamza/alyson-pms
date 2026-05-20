import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { fetchAppLogs, aggregateAppUsage } from '../services/app-logs.service';
import { useOrgUserIds } from '@/domains/people/hooks/use-org-users';

export function useAppUsageStats(start: Date, end: Date, selectedUser?: string, enabled = true) {
  const { userDetails, isSuperAdmin } = useAuth();
  const { data: orgUserIds } = useOrgUserIds();

  return useQuery({
    queryKey: ['app-usage', start.toISOString(), end.toISOString(), selectedUser, userDetails?.organization_id],
    queryFn: async () => {
      const logs = await fetchAppLogs(start, end, {
        organizationId: userDetails?.organization_id,
        isSuperAdmin,
        orgUserIds: orgUserIds || [],
      }, selectedUser);
      return aggregateAppUsage(logs);
    },
    enabled: enabled && !!userDetails,
    staleTime: 30_000,
  });
}
