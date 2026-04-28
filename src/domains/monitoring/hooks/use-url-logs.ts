import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { fetchUrlLogs, aggregateUrlUsage } from '../services/url-logs.service';
import { useOrgUserIds } from '@/domains/people/hooks/use-org-users';

export function useUrlUsageStats(start: Date, end: Date, selectedUser?: string, enabled = true) {
  const { userDetails, isSuperAdmin } = useAuth();
  const { data: orgUserIds } = useOrgUserIds();

  return useQuery({
    queryKey: ['url-usage', start.toISOString(), end.toISOString(), selectedUser, userDetails?.organization_id],
    queryFn: async () => {
      const logs = await fetchUrlLogs(start, end, {
        organizationId: userDetails?.organization_id,
        isSuperAdmin,
        orgUserIds: orgUserIds || [],
      }, selectedUser);
      return aggregateUrlUsage(logs);
    },
    enabled: enabled && !!userDetails,
    staleTime: 30_000,
  });
}
