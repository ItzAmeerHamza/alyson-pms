import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { fetchOrgUsers, fetchOrgUserIds } from '../services/users.service';

export function useOrgUsers(enabled = true) {
  const { userDetails, isSuperAdmin } = useAuth();

  return useQuery({
    queryKey: ['org-users', userDetails?.organization_id],
    queryFn: () =>
      fetchOrgUsers({
        organizationId: userDetails?.organization_id,
        isSuperAdmin,
      }),
    enabled: enabled && !!userDetails,
    staleTime: 60_000,
  });
}

export function useOrgUserIds(enabled = true) {
  const { userDetails, isSuperAdmin } = useAuth();

  return useQuery({
    queryKey: ['org-user-ids', userDetails?.organization_id],
    queryFn: () =>
      fetchOrgUserIds({
        organizationId: userDetails?.organization_id,
        isSuperAdmin,
      }),
    enabled: enabled && !!userDetails,
    staleTime: 60_000,
  });
}
