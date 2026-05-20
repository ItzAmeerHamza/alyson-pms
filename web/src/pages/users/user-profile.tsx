import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, User, Users, Mail, Shield, Clock, Monitor, Loader2, Edit2, Check } from "lucide-react";
import { ManageTeamDialog } from "@/pages/users/components/manage-team-dialog";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean | null;
  last_activity: string | null;
  agent_version?: string | null;
  paused_at: string | null;
  paused_by: string | null;
  pause_reason: string | null;
};

function getEmployeeId(uuid: string): string {
  return "EMP-" + uuid.substring(0, 8).toUpperCase();
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case "admin": return "destructive";
    case "manager": return "outline";
    default: return "secondary";
  }
}

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { userDetails } = useAuth();
  const { toast } = useToast();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState(false);
  const [empIdValue, setEmpIdValue] = useState("");
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [updatingRole, setUpdatingRole] = useState(false);

  const canEdit = userDetails?.role === "admin" || userDetails?.is_super_admin;

  useEffect(() => {
    if (userId) fetchUser();
  }, [userId]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("id, email, full_name, role, avatar_url, is_active, last_activity, paused_at, paused_by, pause_reason")
        .eq("id", userId!)
        .single();

      if (error) throw error;

      // Get latest agent version from screenshots
      const { data: versionData } = await supabase
        .from("screenshots")
        .select("agent_version")
        .eq("user_id", userId!)
        .not("agent_version", "is", null)
        .order("captured_at", { ascending: false })
        .limit(1)
        .single();

      setUser({ ...data, agent_version: versionData?.agent_version ?? null });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Could not load user profile.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async () => {
    if (!user || !canEdit) return;
    try {
      setToggling(true);
      const newStatus = !user.is_active;
      const { error } = await supabase
        .from("users")
        .update({ is_active: newStatus })
        .eq("id", user.id);

      if (error) throw error;

      setUser(prev => prev ? { ...prev, is_active: newStatus } : prev);
      toast({
        title: newStatus ? "User Activated" : "User Deactivated",
        description: `${user.full_name} is now ${newStatus ? "active" : "inactive"}.`,
      });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Could not update user status.", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!user || !selectedRole) return;
    try {
      setUpdatingRole(true);
      const { error } = await supabase
        .from("users")
        .update({ role: selectedRole })
        .eq("id", user.id);

      if (error) throw error;

      setUser(prev => prev ? { ...prev, role: selectedRole } : prev);
      toast({
        title: "Role Updated",
        description: `${user.full_name} is now ${selectedRole.replace("_", " ")}.`,
      });
      setRoleDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Could not update role.", variant: "destructive" });
    } finally {
      setUpdatingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/users")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Users
        </Button>
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  const isActive = user.is_active !== false;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/users")} className="mb-6">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Users
      </Button>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name} className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-2xl font-semibold text-muted-foreground">
                {user.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <div>
              <CardTitle className="text-xl">{user.full_name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={getRoleBadgeColor(user.role) as any}>{user.role}</Badge>
                <Badge variant={isActive ? "default" : "secondary"}>
                  {isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Employee ID — editable */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Employee ID</p>
              {editingEmpId ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={empIdValue}
                    onChange={(e) => setEmpIdValue(e.target.value)}
                    className="h-7 font-mono text-sm"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" onClick={() => {
                    toast({ title: "Employee ID updated", description: empIdValue });
                    setEditingEmpId(false);
                  }}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-mono font-semibold">{empIdValue || getEmployeeId(user.id)}</p>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEmpIdValue(empIdValue || getEmployeeId(user.id));
                    setEditingEmpId(true);
                  }}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { label: "Hours", color: "default" },
              { label: "Role", color: "default" },
              { label: "Email", color: "default" },
              { label: "Password", color: "default" },
              { label: "Confirm", color: "default" },
              { label: "Projects", color: "default" },
              { label: "Pause", color: "destructive" },
            ].map(({ label, color }) => (
              <Button
                key={label}
                variant={color === "destructive" ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  if (label === "Role") {
                    setSelectedRole(user.role);
                    setRoleDialogOpen(true);
                  } else {
                    toast({ title: `${label} action`, description: `${label} clicked for ${user.full_name}` });
                  }
                }}
              >
                {label}
              </Button>
            ))}
            {user.role === "team_leader" && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setTeamDialogOpen(true)}
              >
                <Users className="h-4 w-4 mr-1" />
                Team
              </Button>
            )}
          </div>

          {/* Role Change Dialog */}
          <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Role for {user.full_name}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="team_leader">Team Leader</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateRole} disabled={updatingRole || selectedRole === user.role}>
                  {updatingRole && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Update Role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Manage Team Dialog */}
          <ManageTeamDialog
            open={teamDialogOpen}
            onOpenChange={setTeamDialogOpen}
            teamLeaderId={user.id}
            teamLeaderName={user.full_name}
          />

          {/* Email */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
          </div>

          {/* Role */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="font-medium capitalize">{user.role}</p>
            </div>
          </div>

          {/* Last Activity */}
          {user.last_activity && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Last Activity</p>
                <p className="font-medium">{new Date(user.last_activity).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* Agent Version */}
          {user.agent_version && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Agent Version</p>
                <p className="font-medium">{user.agent_version}</p>
              </div>
            </div>
          )}

          {/* Pause Info */}
          {user.paused_at && (
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
              <p className="font-semibold">User is paused</p>
              {user.pause_reason && <p className="mt-1">{user.pause_reason}</p>}
              <p className="text-xs mt-1">{new Date(user.paused_at).toLocaleString()}</p>
            </div>
          )}

          {/* Active / Inactive Toggle */}
          {canEdit && (
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <Label htmlFor="active-toggle" className="text-base font-semibold">
                  Account Status
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {isActive
                    ? "User is active and visible in reports"
                    : "User is inactive and hidden from reports"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {toggling && <Loader2 className="h-4 w-4 animate-spin" />}
                <Switch
                  id="active-toggle"
                  checked={isActive}
                  onCheckedChange={handleToggleActive}
                  disabled={toggling}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
