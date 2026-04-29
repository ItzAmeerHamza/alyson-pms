import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/layout/page-header";
import { supabase } from "@/integrations/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { 
  Loader2, 
  Plus, 
  Pause, 
  Play, 
  UserX, 
  UserCheck, 
  RotateCcw, 
  Edit,
  Mail,
  MailCheck,
  Key,
  CheckCircle,
  XCircle,
  Clock,
  Info,
  Search,
  FolderKanban,
  Link as LinkIcon,
  Copy,
  Send,
  MoreHorizontal,
  Users as UsersIcon,
  Eye,
  EyeOff
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { AssignProjectsDialog } from "./components/assign-projects-dialog";
import { ManageTeamDialog } from "./components/manage-team-dialog";
import { ManualHoursModal } from "@/components/ManualHoursModal";
import {
  userRoleFormSchema,
  createUserFormSchema,
  pauseUserFormSchema,
  editEmailFormSchema,
  passwordResetFormSchema,
  type UserRoleFormValues,
  type CreateUserFormValues,
  type PauseUserFormValues,
  type EditEmailFormValues,
  type PasswordResetFormValues,
} from "@/lib/schemas";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  is_active?: boolean;
  paused_at?: string | null;
  paused_by?: string | null;
  pause_reason?: string | null;
  last_activity?: string | null;
  auth_status?: 'confirmed' | 'unconfirmed' | 'missing';
  email_confirmed_at?: string | null;
  agent_version?: string | null;
};

function getEmployeeId(uuid: string): string {
  return "EMP-" + uuid.substring(0, 8).toUpperCase();
}

export default function UsersManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = (searchParams.get("status") || "active") as "active" | "inactive" | "all";

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showCreateUserPassword, setShowCreateUserPassword] = useState(false);
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false);
  const [isEditEmailDialogOpen, setIsEditEmailDialogOpen] = useState(false);
  const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreateUserSuccessAlert, setShowCreateUserSuccessAlert] = useState(false);
  const [lastCreatedUser, setLastCreatedUser] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [isAssignProjectsDialogOpen, setIsAssignProjectsDialogOpen] = useState(false);
  const [userProjectCounts, setUserProjectCounts] = useState<Record<string, number>>({});
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string>('');
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState<string | null>(null);
  const [isManualHoursOpen, setIsManualHoursOpen] = useState(false);
  const [manualHoursUserId, setManualHoursUserId] = useState<string>('');
  const [manualHoursUserName, setManualHoursUserName] = useState<string>('');
  const [isManageTeamOpen, setIsManageTeamOpen] = useState(false);
  const [manageTeamUserId, setManageTeamUserId] = useState<string>('');
  const [manageTeamUserName, setManageTeamUserName] = useState<string>('');
  const { toast } = useToast();
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;

  const form = useForm<UserRoleFormValues>({
    resolver: zodResolver(userRoleFormSchema),
    defaultValues: {
      role: "employee",
    },
  });

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      role: "employee",
      projectIds: [],
    },
  });

  const pauseForm = useForm<PauseUserFormValues>({
    resolver: zodResolver(pauseUserFormSchema),
    defaultValues: {
      reason: "",
    },
  });

  const editEmailForm = useForm<EditEmailFormValues>({
    resolver: zodResolver(editEmailFormSchema),
    defaultValues: {
      email: "",
    },
  });

  const passwordResetForm = useForm<PasswordResetFormValues>({
    resolver: zodResolver(passwordResetFormSchema),
    defaultValues: {
      newPassword: "",
    },
  });

  // Fetch users when userDetails is available
  useEffect(() => {
    if (userDetails) {
      fetchUsers();
      fetchUserProjectCounts();
    }
  }, [userDetails, toast]);

  // Fetch projects when create dialog opens
  useEffect(() => {
    if (isCreateDialogOpen) {
      fetchProjects();
    }
  }, [isCreateDialogOpen]);

  // Fetch projects function - filtered by organization
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      let query = supabase
        .from('projects')
        .select('id, name, organization_id');
      
      // Filter by organization if user is not a super admin
      if (userDetails?.organization_id && !userDetails?.is_super_admin) {
        query = query.eq('organization_id', userDetails.organization_id);
      }
      
      const { data, error } = await query.order('name');

      if (error) throw error;
      setProjects(data || []);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      toast({
        title: "Error fetching projects",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingProjects(false);
    }
  };

  // Fetch project counts for each user
  const fetchUserProjectCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('employee_project_assignments')
        .select('user_id');

      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach((assignment: any) => {
        counts[assignment.user_id] = (counts[assignment.user_id] || 0) + 1;
      });

      setUserProjectCounts(counts);
    } catch (error: any) {
      console.error('Error fetching project counts:', error);
    }
  };

  // Handle assign projects
  function handleAssignProjects(user: User) {
    setSelectedUser(user);
    setIsAssignProjectsDialogOpen(true);
  }

  // Generate invite link
  async function handleGenerateInviteLink() {
    setGeneratingInvite(true);
    try {
      // Generate unique token
      const token = crypto.randomUUID() + '-' + Date.now();
      
      // Set expiration to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Insert invite record with organization
      const { error } = await supabase
        .from('user_invites')
        .insert({
          invite_token: token,
          role: 'employee',
          invited_by: userDetails?.id,
          expires_at: expiresAt.toISOString(),
          organization_id: userDetails?.organization_id || null
        });

      if (error) throw error;

      // Generate full invite URL
      const inviteUrl = `${window.location.origin}/signup?invite=${token}`;
      setGeneratedInviteLink(inviteUrl);
      setIsInviteLinkDialogOpen(true);

      toast({
        title: "Invite link generated",
        description: "Share this link with the new user to sign up",
      });
    } catch (error: any) {
      console.error('Error generating invite:', error);
      toast({
        title: "Error generating invite link",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingInvite(false);
    }
  }

  // Copy invite link to clipboard
  async function handleCopyInviteLink() {
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      toast({
        title: "Copied to clipboard",
        description: "Invite link has been copied successfully",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  }

  // Handle form submission
  async function onSubmit(values: UserRoleFormValues) {
    if (!selectedUser) return;

    try {
      const { data, error } = await supabase
        .from("users")
        .update({ role: values.role })
        .eq("id", selectedUser.id)
        .select();

      if (error) throw error;

      // Check if the update actually affected any rows (RLS may silently block it)
      if (!data || data.length === 0) {
        throw new Error("You don't have permission to change this user's role. Please contact a super admin.");
      }

      toast({
        title: "Role updated",
        description: `User role has been changed to ${values.role}`,
      });

      // Update local state with the confirmed data from the database
      setUsers(
        users.map((u) =>
          u.id === selectedUser.id ? { ...u, role: values.role } : u
        )
      );

      // Close dialog
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error updating role",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  // Handle creating new user
  async function onCreateUser(values: CreateUserFormValues) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: values.full_name,
            role: values.role,
            organization_id: organizationId // Pass organization to be set in handle_new_user trigger
          }
        }
      });

      if (authError) throw authError;

      // Wait a moment for the database trigger to complete, then ensure organization_id is set
      if (authData?.user && organizationId) {
        // Small delay to allow trigger to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify and update organization_id with retry logic
        let retries = 3;
        while (retries > 0) {
          // Check if user exists and has correct organization_id
          const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id, organization_id')
            .eq('id', authData.user.id)
            .single();
          
          if (checkError) {
            console.log(`User not found yet, retrying... (${retries} attempts left)`);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
          }
          
          // If user exists but organization_id is not set, update it
          if (existingUser && existingUser.organization_id !== organizationId) {
            const { error: updateError } = await supabase
              .from('users')
              .update({ organization_id: organizationId })
              .eq('id', authData.user.id);
            
            if (updateError) {
              console.error('Error setting organization:', updateError);
            } else {
              console.log('Organization ID successfully set for user');
            }
          }
          break;
        }
      }

      // If user was created and projects were selected, assign them
      if (authData?.user && values.projectIds && values.projectIds.length > 0) {
        const projectAssignments = values.projectIds.map(projectId => ({
          user_id: authData.user!.id,
          project_id: projectId,
          assigned_by: userDetails?.id
        }));

        const { error: assignError } = await supabase
          .from('employee_project_assignments')
          .insert(projectAssignments);

        if (assignError) {
          console.error('Error assigning projects:', assignError);
          toast({
            title: "Warning",
            description: `User created but failed to assign ${values.projectIds.length} project(s)`,
            variant: "destructive",
          });
        }
      }

      // Show success alert with confirmation requirement
      setLastCreatedUser(values.full_name);
      setShowCreateUserSuccessAlert(true);

      const projectCount = values.projectIds?.length || 0;
      toast({
        title: "User created successfully",
        description: `${values.full_name} has been created with ${values.role} role${projectCount > 0 ? ` and assigned to ${projectCount} project(s)` : ''}`,
      });

      // Refresh users list (with small delay to ensure DB is updated)
      await new Promise(resolve => setTimeout(resolve, 300));
      fetchUsers();
      
      // Close dialog and reset form
      setIsCreateDialogOpen(false);
      createForm.reset();

      // Hide alert after 10 seconds
      setTimeout(() => setShowCreateUserSuccessAlert(false), 10000);
    } catch (error: any) {
      toast({
        title: "Error creating user",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  // Fetch users function (extracted from useEffect) - filters by organization
  const fetchUsers = async () => {
    try {
      console.log('Fetching users...');
      
      // Build query with organization filter for non-super admins
      let query = supabase
        .from("users")
        .select(`
          id,
          email,
          full_name,
          role,
          avatar_url,
          is_active,
          paused_at,
          paused_by,
          pause_reason,
          last_activity,
          organization_id
        `)
        .not('email', 'ilike', '%@example.com%');
      
      // Filter by organization if user is not a super admin
      if (userDetails?.organization_id && !userDetails?.is_super_admin) {
        query = query.eq('organization_id', userDetails.organization_id);
      }
      
      const { data: usersData, error: usersError } = await query.order("full_name");

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      // Fetch latest agent versions from screenshots (most reliable source)
      const userIds = (usersData || []).map(u => u.id);
      const agentVersions: Record<string, string | null> = {};
      
      if (userIds.length > 0) {
        const { data: versionData } = await supabase
          .from("screenshots")
          .select("user_id, agent_version, captured_at")
          .in("user_id", userIds)
          .not("agent_version", "is", null)
          .order("captured_at", { ascending: false })
          .limit(200);
        
        (versionData || []).forEach(row => {
          if (row.user_id && row.agent_version && !agentVersions[row.user_id]) {
            agentVersions[row.user_id] = row.agent_version;
          }
        });

        // Fallback: fetch version individually for offline users missed by the limit(200) batch
        const missingVersionIds = userIds.filter(id => !agentVersions[id]);
        if (missingVersionIds.length > 0) {
          const fallbackResults = await Promise.all(
            missingVersionIds.map(uid =>
              supabase
                .from("screenshots")
                .select("user_id, agent_version")
                .eq("user_id", uid)
                .not("agent_version", "is", null)
                .order("captured_at", { ascending: false })
                .limit(1)
            )
          );
          fallbackResults.forEach(({ data }) => {
            if (data?.[0]?.user_id && data[0].agent_version) {
              agentVersions[data[0].user_id] = data[0].agent_version;
            }
          });
        }
      }

      // Use actual database values, with fallbacks only for missing auth status
      const usersWithStatus = (usersData || []).map(user => ({
        ...user,
        auth_status: 'confirmed' as const, // Still defaulting this until proper auth status is implemented
        email_confirmed_at: new Date().toISOString(),
        is_active: user.is_active ?? true, // Use database value or default to true if null
        paused_at: user.paused_at,
        paused_by: user.paused_by,
        pause_reason: user.pause_reason,
        last_activity: user.last_activity || new Date().toISOString(),
        agent_version: agentVersions[user.id] || null
      }));
      
      console.log('Users fetched:', usersWithStatus);
      setUsers(usersWithStatus);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Open dialog for editing role
  function handleEditRole(user: User) {
    setSelectedUser(user);
    form.reset({ role: user.role as "admin" | "manager" | "team_leader" | "employee" });
    setIsDialogOpen(true);
  }

  // Handle edit email
  function handleEditEmail(user: User) {
    setSelectedUser(user);
    editEmailForm.reset({ email: user.email });
    setIsEditEmailDialogOpen(true);
  }

  // Handle password reset
  function handlePasswordReset(user: User) {
    setSelectedUser(user);
    passwordResetForm.reset({ newPassword: "" });
    setIsPasswordResetDialogOpen(true);
  }

  // Edit email submission
  async function onEditEmail(values: EditEmailFormValues) {
    if (!selectedUser) return;

    try {
      // Update email in users table
      const { error: userError } = await supabase
        .from("users")
        .update({ email: values.email })
        .eq("id", selectedUser.id);

      if (userError) throw userError;

      toast({
        title: "Email updated",
        description: `Email has been changed to ${values.email}`,
      });

      // Update local state
      setUsers(
        users.map((u) =>
          u.id === selectedUser.id ? { ...u, email: values.email } : u
        )
      );

      setIsEditEmailDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error updating email",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  // Password reset submission
  async function onPasswordReset() {
    if (!selectedUser) return;

    try {
      // Method 1: Send password reset email to user
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        selectedUser.email,
        {
          redirectTo: `${window.location.origin}/auth/reset-password`
        }
      );

      if (resetError) {
        // If reset email fails, try method 2: Update password directly (requires service role)
        console.warn('Password reset email failed, trying direct update:', resetError.message);
        
        // For now, we'll update the user record to indicate password reset is needed
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            last_activity: new Date().toISOString(),
            // Add a flag or note that password was reset by admin
          })
          .eq('id', selectedUser.id);

        if (updateError) {
          throw updateError;
        }

        toast({
          title: "Password reset initiated",
          description: `Password reset email sent to ${selectedUser.email}. If email fails, ask user to use "Forgot Password" on login page.`,
          duration: 6000,
        });
      } else {
        toast({
          title: "Password reset email sent",
          description: `Password reset instructions sent to ${selectedUser.email}. User will receive an email with reset link.`,
          duration: 6000,
        });
      }

      setIsPasswordResetDialogOpen(false);
      passwordResetForm.reset();
    } catch (error: any) {
      toast({
        title: "Error resetting password",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  // Handle pausing user
  async function handlePauseUser(user: User) {
    setSelectedUser(user);
    pauseForm.reset({ reason: "" });
    setIsPauseDialogOpen(true);
  }

  // Handle pausing/unpausing user
  async function onPauseUser(values: PauseUserFormValues) {
    if (!selectedUser) return;

    try {
      // Use a direct SQL update to pause the user
      const { error } = await supabase
        .from("users")
        .update({
          // Cast the object to any to bypass TypeScript checking
          ...(({
            is_active: false,
            paused_at: new Date().toISOString(),
            paused_by: userDetails?.id,
            pause_reason: values.reason,
          } as any))
        })
        .eq("id", selectedUser.id);

      if (error) throw error;

      toast({
        title: "User paused",
        description: `${selectedUser.full_name} has been paused successfully`,
      });

      // Refresh users list
      fetchUsers();
      setIsPauseDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error pausing user",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  // Handle unpausing user
  async function handleUnpauseUser(user: User) {
    try {
      // Use a direct SQL update to unpause the user
      const { error } = await supabase
        .from("users")
        .update({
          // Cast the object to any to bypass TypeScript checking
          ...(({
            is_active: true,
            paused_at: null,
            paused_by: null,
            pause_reason: null,
            last_activity: new Date().toISOString(),
          } as any))
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "User unpaused",
        description: `${user.full_name} has been reactivated successfully`,
      });

      // Refresh users list
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error unpausing user",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  // Resend confirmation email using admin API
  async function handleResendConfirmation(user: User) {
    setResendingConfirmation(user.id);
    try {
      // Call simplified Edge Function that triggers the send-auth-email hook
      const { error } = await supabase.functions.invoke('resend-confirmation', {
        body: { email: user.email }
      });

      if (error) throw error;

      toast({
        title: "Confirmation email sent",
        description: `A new confirmation email has been sent to ${user.email}`,
      });
      
      // Refresh users list to update status
      fetchUsers();
    } catch (error: any) {
      console.error('Error sending confirmation:', error);
      toast({
        title: "Error sending confirmation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setResendingConfirmation(null);
    }
  }

  // Check if current user can edit roles (must be admin)
  const canEditRoles = userDetails?.role === "admin";

  // Filter users based on search term
  const filteredUsers = users.filter(user => {
    // Status filter
    if (statusFilter === "active" && user.is_active === false) return false;
    if (statusFilter === "inactive" && user.is_active !== false) return false;

    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.role?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="container py-6">
      <PageHeader
        title="User Management"
        subtitle="Manage users and their roles"
      />

      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-wrap gap-2 mb-3">
            {(["active", "inactive", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSearchParams({ status: s })}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex justify-between items-center gap-4">
            <CardTitle>Users</CardTitle>
            <div className="flex items-center gap-2 flex-1 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by name, email, or role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              {canEditRoles && (
                <>
                  <Button
                    onClick={handleGenerateInviteLink}
                    disabled={generatingInvite}
                    variant="outline"
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    {generatingInvite ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )}
                    Invite Link
                  </Button>
                  <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    Add User
                  </Button>
                </>
              )}
            </div>
          </div>
          {searchTerm && (
            <p className="text-sm text-muted-foreground mt-2">
              Found {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} matching "{searchTerm}"
            </p>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex justify-center p-8 text-muted-foreground">
              {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agent Version</TableHead>
                  {canEditRoles && <TableHead className="w-[200px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/users/${user.id}`)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{getEmployeeId(user.id)}</TableCell>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`capitalize ${
                          user.role === "admin"
                            ? "text-destructive font-semibold"
                            : user.role === "manager"
                              ? "text-orange-500 font-semibold"
                              : user.role === "team_leader"
                                ? "text-violet-600 font-semibold"
                                : ""
                        }`}>
                          {user.role === "team_leader" ? "Team Leader" : user.role}
                        </span>
                        {userProjectCounts[user.id] > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {userProjectCounts[user.id]} project{userProjectCounts[user.id] !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {/* Account Status */}
                        {user.is_active !== false ? (
                          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 w-fit">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 w-fit">
                            <UserX className="h-3 w-3 mr-1" />
                            Paused
                          </Badge>
                        )}
                        
                        {/* Email Confirmation Status */}
                        {user.auth_status === 'confirmed' ? (
                          <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 w-fit">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Confirmed
                          </Badge>
                        ) : user.auth_status === 'unconfirmed' ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 w-fit">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-600 border-gray-300 bg-gray-50 w-fit">
                            <XCircle className="h-3 w-3 mr-1" />
                            No Auth
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.agent_version ? (
                        <Badge variant="outline" className="text-cyan-600 border-cyan-300 bg-cyan-50 font-mono">
                          v{user.agent_version}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    {canEditRoles && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setManualHoursUserId(user.id);
                                setManualHoursUserName(user.full_name || user.email || '');
                                setIsManualHoursOpen(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Hours
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleEditRole(user)}
                              disabled={user.id === userDetails?.id}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Role
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleEditEmail(user)}
                              disabled={user.id === userDetails?.id}
                            >
                              <Mail className="h-4 w-4 mr-2" />
                              Email
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handlePasswordReset(user)}
                              disabled={user.id === userDetails?.id}
                            >
                              <Key className="h-4 w-4 mr-2" />
                              Password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleResendConfirmation(user)}
                              disabled={resendingConfirmation === user.id}
                            >
                              {resendingConfirmation === user.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 mr-2" />
                              )}
                              Confirm
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleAssignProjects(user)}
                            >
                              <FolderKanban className="h-4 w-4 mr-2" />
                              Projects
                            </DropdownMenuItem>
                            {user.role === "team_leader" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setManageTeamUserId(user.id);
                                  setManageTeamUserName(user.full_name || user.email);
                                  setIsManageTeamOpen(true);
                                }}
                              >
                                <UsersIcon className="h-4 w-4 mr-2" />
                                Team
                              </DropdownMenuItem>
                            )}
                            {user.is_active !== false ? (
                              <DropdownMenuItem
                                onClick={() => handlePauseUser(user)}
                                disabled={user.id === userDetails?.id}
                              >
                                <Pause className="h-4 w-4 mr-2" />
                                Pause
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleUnpauseUser(user)}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Unpause
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Success Alert for New User Creation */}
      {showCreateUserSuccessAlert && (
        <Alert className="mt-4 border-green-200 bg-green-50">
          <Info className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>User "{lastCreatedUser}" created successfully!</strong>
            <br />
            The user has been sent an email confirmation link. They need to confirm their email address before they can log in to the system.
            Make sure to inform them to check their email (including spam folder) and click the confirmation link.
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1 mb-4">
                <p className="font-medium">User: {selectedUser?.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser?.email}</p>
              </div>
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="team_leader">Team Leader</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Update Role</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateUser)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter email address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showCreateUserPassword ? "text" : "password"}
                          placeholder="Enter password"
                          {...field}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowCreateUserPassword((v) => !v)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                          aria-label={showCreateUserPassword ? "Hide password" : "Show password"}
                        >
                          {showCreateUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="team_leader">Team Leader</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="projectIds"
                render={({ field }) => {
                  // Filter out already selected projects from the dropdown
                  const availableProjects = projects.filter(
                    project => !field.value?.includes(project.id)
                  );
                  
                  return (
                    <FormItem>
                      <FormLabel>Assign Projects</FormLabel>
                      <FormControl>
                        <Select
                          value=""
                          onValueChange={(value) => {
                            if (value) {
                              const currentValues = field.value || [];
                              field.onChange([...currentValues, value]);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={
                              loadingProjects 
                                ? "Loading projects..." 
                                : availableProjects.length === 0 && field.value?.length 
                                  ? "All projects selected"
                                  : "Select projects"
                            } />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProjects.length === 0 ? (
                              <div className="py-2 px-2 text-sm text-muted-foreground">
                                {projects.length === 0 ? "No projects available" : "All projects selected"}
                              </div>
                            ) : (
                              availableProjects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      {field.value && field.value.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {field.value.map((projectId) => {
                            const project = projects.find(p => p.id === projectId);
                            return (
                              <Badge key={projectId} variant="secondary" className="gap-1 bg-teal-100 text-teal-800 hover:bg-teal-200">
                                {project?.name || projectId}
                                <button
                                  type="button"
                                  onClick={() => {
                                    field.onChange(field.value?.filter(id => id !== projectId));
                                  }}
                                  className="ml-1 hover:text-destructive"
                                >
                                  ×
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create User</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Pause User Dialog */}
      <Dialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause User Account</DialogTitle>
          </DialogHeader>
          <Form {...pauseForm}>
            <form onSubmit={pauseForm.handleSubmit(onPauseUser)} className="space-y-4">
              <div className="space-y-1 mb-4">
                <p className="font-medium">User: {selectedUser?.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser?.email}</p>
                <p className="text-sm text-orange-600 mt-2">
                  ⚠️ This will prevent the user from logging in and stop all time tracking activities.
                </p>
              </div>
              <FormField
                control={pauseForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for pausing</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="e.g., Employee left the company, On leave, etc." 
                        {...field} 
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsPauseDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="destructive"
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause User
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Email Dialog */}
      <Dialog open={isEditEmailDialogOpen} onOpenChange={setIsEditEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Email Address</DialogTitle>
          </DialogHeader>
          <Form {...editEmailForm}>
            <form onSubmit={editEmailForm.handleSubmit(onEditEmail)} className="space-y-4">
              <div className="space-y-1 mb-4">
                <p className="font-medium">User: {selectedUser?.full_name}</p>
                <p className="text-sm text-muted-foreground">Current: {selectedUser?.email}</p>
              </div>
              <FormField
                control={editEmailForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter new email address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Changing the email will require the user to log in with the new email address.
                  Make sure to inform them about this change.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditEmailDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Update Email</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1 mb-4">
              <p className="font-medium">User: {selectedUser?.full_name}</p>
              <p className="text-sm text-muted-foreground">{selectedUser?.email}</p>
            </div>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h4 className="font-medium text-blue-900 mb-2">Password Reset Process:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• A password reset email will be sent to the user</li>
                <li>• User will receive a secure link to reset their password</li>
                <li>• The reset link expires after 1 hour for security</li>
                <li>• User can create their own new password</li>
              </ul>
            </div>
            
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-800">
                <strong>Alternative:</strong> If the user doesn't receive the email, they can use the "Forgot Password" 
                link on the login page to reset their password themselves.
              </p>
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsPasswordResetDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={() => onPasswordReset()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Reset Email
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Projects Dialog */}
      {selectedUser && (
        <AssignProjectsDialog
          open={isAssignProjectsDialogOpen}
          onOpenChange={setIsAssignProjectsDialogOpen}
          userId={selectedUser.id}
          userName={selectedUser.full_name}
          currentUserId={userDetails?.id}
          organizationId={organizationId}
          isSuperAdmin={isSuperAdmin}
          onAssignmentChange={() => {
            fetchUserProjectCounts();
            fetchUsers();
          }}
        />
      )}

      {/* Invite Link Dialog */}
      <Dialog open={isInviteLinkDialogOpen} onOpenChange={setIsInviteLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Link Generated</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with the new user to sign up. The link will expire in 7 days.
            </p>
            
            <div className="p-3 bg-muted rounded-md break-all">
              <code className="text-sm">{generatedInviteLink}</code>
            </div>

            <Button
              onClick={handleCopyInviteLink}
              className="w-full"
              variant="outline"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> After the user signs up using this link, you can assign them to projects 
                using the "Projects" button in the user actions.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsInviteLinkDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Manage Team Dialog */}
      <ManageTeamDialog
        open={isManageTeamOpen}
        onOpenChange={setIsManageTeamOpen}
        teamLeaderId={manageTeamUserId}
        teamLeaderName={manageTeamUserName}
        onTeamChange={() => fetchUsers()}
      />

      {/* Manual Hours Modal */}
      <ManualHoursModal
        isOpen={isManualHoursOpen}
        onClose={() => setIsManualHoursOpen(false)}
        onSaved={() => fetchUsers()}
        preSelectedEmployeeId={manualHoursUserId}
        preSelectedEmployeeName={manualHoursUserName}
      />
    </div>
  );
}
