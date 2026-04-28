import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/components/ui/use-toast';

export interface TeamAssignment {
  id: string;
  team_leader_id: string;
  employee_id: string;
  assigned_at: string;
  assigned_by: string | null;
  employee?: {
    id: string;
    full_name: string | null;
    email: string;
    role: string | null;
    avatar_url: string | null;
  };
}

export interface TeamMemberStats {
  userId: string;
  fullName: string;
  email: string;
  todayHours: number;
  activityPercent: number;
  isOnline: boolean;
  lastActivity: string | null;
}

export function useTeamLeaderAssignments(teamLeaderId?: string) {
  const [assignments, setAssignments] = useState<TeamAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAssignments = useCallback(async () => {
    if (!teamLeaderId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('team_leader_assignments')
        .select(`
          id,
          team_leader_id,
          employee_id,
          assigned_at,
          assigned_by
        `)
        .eq('team_leader_id', teamLeaderId)
        .order('assigned_at', { ascending: false });

      if (error) throw error;

      // Fetch employee details separately
      if (data && data.length > 0) {
        const employeeIds = data.map(a => a.employee_id);
        const { data: employees, error: empError } = await supabase
          .from('users')
          .select('id, full_name, email, role, avatar_url')
          .in('id', employeeIds);

        if (empError) throw empError;

        const employeeMap = new Map(
          (employees || []).map(e => [e.id, e])
        );

        const enriched = data.map(a => ({
          ...a,
          employee: employeeMap.get(a.employee_id) || undefined,
        }));

        setAssignments(enriched);
      } else {
        setAssignments([]);
      }
    } catch (error: any) {
      console.error('Error fetching team assignments:', error);
      toast({
        title: 'Error loading team',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [teamLeaderId, toast]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return { assignments, loading, refetch: fetchAssignments };
}

export function useManageTeam() {
  const { toast } = useToast();
  const { userDetails } = useAuth();

  const addEmployees = async (teamLeaderId: string, employeeIds: string[]) => {
    try {
      const rows = employeeIds.map(empId => ({
        team_leader_id: teamLeaderId,
        employee_id: empId,
        assigned_by: userDetails?.id,
      }));

      const { error } = await supabase
        .from('team_leader_assignments')
        .insert(rows);

      if (error) throw error;

      toast({
        title: 'Team updated',
        description: `Added ${employeeIds.length} employee(s) to the team`,
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Error adding employees',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeEmployee = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('team_leader_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      toast({
        title: 'Employee removed',
        description: 'Employee has been removed from the team',
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Error removing employee',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  return { addEmployees, removeEmployee };
}

export function useAllTeamAssignments() {
  const [assignmentMap, setAssignmentMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data, error } = await supabase
          .from('team_leader_assignments')
          .select('employee_id, team_leader_id');

        if (error) throw error;

        const map: Record<string, string> = {};
        (data || []).forEach(a => {
          map[a.employee_id] = a.team_leader_id;
        });
        setAssignmentMap(map);
      } catch {
        // silent fail for admin view
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  return { assignmentMap, loading };
}
