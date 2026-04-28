import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";

interface Employee {
  id: string;
  full_name: string | null;
  email: string;
}

interface Assignment {
  id: string;
  employee_id: string;
  employee: Employee;
}

interface ManageTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamLeaderId: string;
  teamLeaderName: string;
  onTeamChange?: () => void;
}

export function ManageTeamDialog({
  open,
  onOpenChange,
  teamLeaderId,
  teamLeaderName,
  onTeamChange,
}: ManageTeamDialogProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignedElsewhere, setAssignedElsewhere] = useState<Record<string, string>>({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { toast } = useToast();
  const { userDetails } = useAuth();

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, teamLeaderId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all employees in organization
      let empQuery = supabase
        .from("users")
        .select("id, full_name, email")
        .eq("role", "employee")
        .order("full_name");

      if (userDetails?.organization_id && !userDetails?.is_super_admin) {
        empQuery = empQuery.eq("organization_id", userDetails.organization_id);
      }

      const { data: empData, error: empError } = await empQuery;
      if (empError) throw empError;
      setEmployees(empData || []);

      // Fetch this team leader's current assignments
      const { data: assignData, error: assignError } = await supabase
        .from("team_leader_assignments")
        .select("id, employee_id")
        .eq("team_leader_id", teamLeaderId);

      if (assignError) throw assignError;

      // Enrich with employee details
      const enriched: Assignment[] = (assignData || []).map((a) => {
        const emp = (empData || []).find((e) => e.id === a.employee_id);
        return {
          ...a,
          employee: emp || { id: a.employee_id, full_name: "Unknown", email: "" },
        };
      });
      setAssignments(enriched);

      // Fetch all assignments to know who is assigned elsewhere
      const { data: allAssignments, error: allError } = await supabase
        .from("team_leader_assignments")
        .select("employee_id, team_leader_id");

      if (allError) throw allError;

      const elsewhereMap: Record<string, string> = {};
      (allAssignments || []).forEach((a) => {
        if (a.team_leader_id !== teamLeaderId) {
          elsewhereMap[a.employee_id] = a.team_leader_id;
        }
      });
      setAssignedElsewhere(elsewhereMap);
    } catch (error: any) {
      console.error("Error fetching team data:", error);
      toast({
        title: "Error loading team data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleEmployee = (empId: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
      } else {
        next.add(empId);
      }
      return next;
    });
  };

  const handleAssignBulk = async () => {
    if (selectedEmployeeIds.size === 0) return;

    setAssigning(true);
    try {
      const inserts = Array.from(selectedEmployeeIds).map((empId) => ({
        team_leader_id: teamLeaderId,
        employee_id: empId,
        assigned_by: userDetails?.id,
      }));

      const { error } = await supabase
        .from("team_leader_assignments")
        .insert(inserts);

      if (error) throw error;

      toast({
        title: "Employees assigned",
        description: `${selectedEmployeeIds.size} employee(s) added to the team`,
      });

      await fetchData();
      setSelectedEmployeeIds(new Set());
      onTeamChange?.();
    } catch (error: any) {
      toast({
        title: "Error assigning employees",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (assignmentId: string, employeeName: string) => {
    try {
      const { error } = await supabase
        .from("team_leader_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;

      toast({
        title: "Employee removed",
        description: `${employeeName} has been removed from the team`,
      });

      await fetchData();
      onTeamChange?.();
    } catch (error: any) {
      toast({
        title: "Error removing employee",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Filter out already-assigned employees for this team leader
  const currentAssignedIds = new Set(assignments.map((a) => a.employee_id));
  const availableEmployees = employees.filter((e) => !currentAssignedIds.has(e.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Team: {teamLeaderName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Team Members */}
            <div className="space-y-2">
              <Label>Current Team Members ({assignments.length})</Label>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No employees assigned yet</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-2 rounded-md border bg-muted/50"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          {assignment.employee.full_name || assignment.employee.email}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {assignment.employee.email}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleRemove(
                            assignment.id,
                            assignment.employee.full_name || assignment.employee.email
                          )
                        }
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Employees (Multi-Select) */}
            <div className="space-y-2">
              <Label>Add Employees to Team {selectedEmployeeIds.size > 0 && `(${selectedEmployeeIds.size} selected)`}</Label>
              {availableEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No more employees available to assign
                </p>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto border rounded-md p-1 space-y-1">
                    {availableEmployees.map((emp) => (
                      <label
                        key={emp.id}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedEmployeeIds.has(emp.id) ? "bg-primary/10 border border-primary/30" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployeeIds.has(emp.id)}
                          onChange={() => toggleEmployee(emp.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">
                            {emp.full_name || emp.email}
                          </span>
                          <span className="text-xs text-muted-foreground block truncate">
                            {emp.email}
                          </span>
                        </div>
                        {assignedElsewhere[emp.id] && (
                          <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                        )}
                      </label>
                    ))}
                  </div>
                  <Button
                    onClick={handleAssignBulk}
                    disabled={selectedEmployeeIds.size === 0 || assigning}
                    className="w-full"
                  >
                    {assigning ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Add {selectedEmployeeIds.size > 0 ? `${selectedEmployeeIds.size} Employee(s)` : "Selected"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
