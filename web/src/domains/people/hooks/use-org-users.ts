import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { shouldRetryQuery } from '@/lib/api-error';
import { fetchOrgUsers } from '../services/users.service';

export function useOrgUsers(enabled = true) {
  const { userDetails, isSuperAdmin } = useAuth();
  const orgId = userDetails?.organization_id ?? null;

  return useQuery({
    queryKey: ['org-users', orgId, isSuperAdmin],
    queryFn: () =>
      fetchOrgUsers({
        organizationId: orgId,
        isSuperAdmin,
      }),
    enabled: enabled && !!userDetails?.id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: shouldRetryQuery,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

/** Reuses org-users cache — avoids a second GET /data/users per page. */
export function useOrgUserIds(enabled = true) {
  const usersQuery = useOrgUsers(enabled);
  return {
    ...usersQuery,
    data: usersQuery.data?.map((u) => u.id),
  };
}
