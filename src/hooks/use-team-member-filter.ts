import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';

export function useTeamMemberFilter() {
  const { userDetails } = useAuth();
  const isTeamLeader = userDetails?.role === 'team_leader';
  const [teamMemberIds, setTeamMemberIds] = useState<string[] | null>(null); // null = no filter (admin)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTeamLeader || !userDetails?.id) {
      setTeamMemberIds(null); // admin sees all
      setLoading(false);
      return;
    }

    supabase
      .from('team_leader_assignments')
      .select('employee_id')
      .eq('team_leader_id', userDetails.id)
      .then(({ data }) => {
        setTeamMemberIds((data || []).map(d => d.employee_id));
        setLoading(false);
      });
  }, [isTeamLeader, userDetails?.id]);

  return { teamMemberIds, isTeamLeader, loading };
}
