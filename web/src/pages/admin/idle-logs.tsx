
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { format, startOfDay, endOfDay } from "date-fns";
import { Calendar as CalendarIcon, Briefcase, Clock } from "lucide-react";
import { fetchOrgUsers, fetchProjects } from "@/domains/people";
import { fetchIdleLogs } from "@/domains/monitoring";
import type { UserRow } from "@/domains/people";
import type { ProjectRow } from "@/domains/people";
import type { IdleLogRow } from "@/domains/monitoring";

interface EnrichedIdleLog extends IdleLogRow {
  users?: { full_name: string; email: string };
  projects?: { name: string };
}

export default function AdminIdleLogs() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const orgCtx = { organizationId, isSuperAdmin };

  const [idleLogs, setIdleLogs] = useState<EnrichedIdleLog[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [selectedUser, selectedProject, selectedDate]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);

      const [usersData, projectsData, logsData] = await Promise.all([
        fetchOrgUsers(orgCtx),
        fetchProjects(orgCtx),
        fetchIdleLogs(start, end, orgCtx, {
          userId: selectedUser || undefined,
          projectId: selectedProject || undefined,
        }),
      ]);

      setUsers(usersData);
      setProjects(projectsData);

      const enrichedLogs: EnrichedIdleLog[] = logsData.map((log) => {
        const user = usersData.find((u) => u.id === log.user_id);
        const project = log.project_id
          ? projectsData.find((p) => p.id === log.project_id)
          : null;
        return {
          ...log,
          users: user ? { full_name: user.full_name, email: user.email } : undefined,
          projects: project ? { name: project.name } : undefined,
        };
      });

      setIdleLogs(enrichedLogs);
    } catch (error: any) {
      console.error("Error fetching idle logs:", error);
      toast({
        title: "Error fetching idle logs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return "N/A";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="container py-6">
      <PageHeader
        title="Idle Time Monitoring"
        subtitle="View user idle periods and productivity"
      />

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full md:w-auto">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, 'MMM dd, yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <EmployeeFilterCombobox
          value={selectedUser || 'all'}
          onValueChange={value => setSelectedUser(value === 'all' ? null : value)}
          users={users}
          className="w-full md:w-[200px]"
        />

        <Select value={selectedProject || 'all'} onValueChange={value => setSelectedProject(value === 'all' ? null : value)}>
          <SelectTrigger className="w-full md:w-[200px]">
            <Briefcase className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Idle Time Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading idle logs...</div>
          ) : idleLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No idle logs found for the selected filters
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Idle Start</TableHead>
                    <TableHead>Idle End</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {idleLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {log.users?.full_name || 'Unknown User'}
                      </TableCell>
                      <TableCell>{log.projects?.name || 'No Project'}</TableCell>
                      <TableCell>
                        {format(new Date(log.idle_start), 'HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        {log.idle_end
                          ? format(new Date(log.idle_end), 'HH:mm:ss')
                          : "Ongoing"
                        }
                      </TableCell>
                      <TableCell>
                        {formatDuration(log.duration_seconds)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
