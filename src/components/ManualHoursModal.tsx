import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmployeeFilterCombobox } from "@/components/shared/employee-filter-combobox";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { Calendar as CalendarIcon, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface ManualHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  preSelectedEmployeeId?: string;
  preSelectedEmployeeName?: string;
}

interface EmployeeOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function ManualHoursModal({
  isOpen,
  onClose,
  onSaved,
  preSelectedEmployeeId,
  preSelectedEmployeeName,
}: ManualHoursModalProps) {
  const [employeeId, setEmployeeId] = useState(preSelectedEmployeeId || "");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [totalMinutes, setTotalMinutes] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [saving, setSaving] = useState(false);

  const { userDetails, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const organizationId = userDetails?.organization_id;

  useEffect(() => {
    if (isOpen) {
      setEmployeeId(preSelectedEmployeeId || "");
      setDate(new Date());
      setStartTime("");
      setEndTime("");
      setTotalMinutes("");
      setReason("");
      setProject("");
      setTask("");
      loadEmployees();
    }
  }, [isOpen, preSelectedEmployeeId]);

  // Auto-calculate total minutes from start/end times
  useEffect(() => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      if (endMins > startMins) {
        setTotalMinutes(endMins - startMins);
      }
    }
  }, [startTime, endTime]);

  const loadEmployees = async () => {
    try {
      let query = supabase
        .from("users")
        .select("id, full_name, email")
        .in("role", ["employee", "admin", "manager"]);

      if (organizationId && !isSuperAdmin) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query.order("full_name");
      if (error) throw error;
      setEmployees(data || []);
    } catch (error: any) {
      console.error("Error loading employees:", error);
    }
  };

  const handleSave = async () => {
    if (!employeeId) {
      toast({ title: "Please select an employee", variant: "destructive" });
      return;
    }
    if (!date) {
      toast({ title: "Please select a date", variant: "destructive" });
      return;
    }
    if (!totalMinutes || totalMinutes <= 0) {
      toast({ title: "Total minutes must be greater than 0", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Please provide a reason", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);

      const newEntry = {
        employee_id: employeeId,
        organization_id: organizationId || null,
        date: format(date, "yyyy-MM-dd"),
        start_time: startTime || null,
        end_time: endTime || null,
        total_minutes: Number(totalMinutes),
        reason: reason.trim(),
        project: project.trim() || null,
        task: task.trim() || null,
        created_by: userDetails!.id,
      };

      const { data, error } = await (supabase
        .from("manual_hours" as any)
        .insert(newEntry)
        .select("id")
        .single() as any);

      if (error) throw error;

      // Create audit entry
      await (supabase.from("manual_hours_audit" as any) as any).insert({
        manual_hours_id: data.id,
        action: "create",
        changed_by: userDetails!.id,
        new_data: newEntry,
      });

      toast({ title: "Manual hours added successfully" });
      onSaved?.();
      onClose();
    } catch (error: any) {
      console.error("Error saving manual hours:", error);
      toast({
        title: "Error saving manual hours",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Add Manual Hours
          </DialogTitle>
          <DialogDescription>
            Manually add time entries for an employee (e.g., offline work, meetings).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee Selector */}
          {preSelectedEmployeeId && preSelectedEmployeeName ? (
            <div className="space-y-2">
              <Label>Employee</Label>
              <Input value={preSelectedEmployeeName} disabled />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Employee *</Label>
              <EmployeeFilterCombobox
                value={employeeId}
                onValueChange={setEmployeeId}
                users={employees}
                placeholder="Select employee"
                includeAllOption={false}
                className="w-full"
              />
            </div>
          )}

          {/* Date Picker */}
          <div className="space-y-2">
            <Label>Date *</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setDatePickerOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Total Minutes */}
          <div className="space-y-2">
            <Label>Total Minutes *</Label>
            <Input
              type="number"
              min={1}
              placeholder="e.g. 120"
              value={totalMinutes}
              onChange={(e) => setTotalMinutes(e.target.value ? Number(e.target.value) : "")}
            />
            {totalMinutes && Number(totalMinutes) > 0 && (
              <p className="text-xs text-muted-foreground">
                = {Math.floor(Number(totalMinutes) / 60)}h {Number(totalMinutes) % 60}m
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              placeholder="e.g., Client meeting, offline work, training session..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
              rows={2}
            />
          </div>

          {/* Project & Task */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Input
                placeholder="Optional"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Task</Label>
              <Input
                placeholder="Optional"
                value={task}
                onChange={(e) => setTask(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Manual Hours
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
