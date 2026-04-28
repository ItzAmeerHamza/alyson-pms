import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Building2, Users, UserPlus, Shield, Loader2 } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean | null;
  created_at: string | null;
  settings: any;
  updated_at?: string | null;
}

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean | null;
  is_org_admin: boolean | null;
  created_at: string | null;
}

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: "",
    full_name: "",
    role: "employee",
    is_org_admin: false,
    password: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [isSuperAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isSuperAdmin && id) {
      fetchOrganization();
      fetchUsers();
    }
  }, [isSuperAdmin, id]);

  async function fetchOrganization() {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      setOrganization(data as any as Organization);
    } catch (error: any) {
      console.error("Error fetching organization:", error);
      toast({
        title: "Error",
        description: "Failed to load organization",
        variant: "destructive",
      });
      navigate("/super-admin/organizations");
    }
  }

  async function fetchUsers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("id, email, full_name, role, is_active, is_org_admin, created_at")
        .eq("organization_id", id!)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setUsers((data || []) as any as User[]);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddUser() {
    if (!newUserData.email || !newUserData.password) {
      toast({
        title: "Validation Error",
        description: "Email and password are required",
        variant: "destructive",
      });
      return;
    }

    if (newUserData.password.length < 6) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newUserData.email,
        password: newUserData.password,
        email_confirm: true,
      });

      if (authError) {
        // If admin API not available, try regular signup
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: newUserData.email,
          password: newUserData.password,
        });

        if (signupError) throw signupError;
        
        // Update the user profile with organization
        if (signupData.user) {
          const { error: updateError } = await supabase
            .from("users")
            .update({
              organization_id: id!,
              full_name: newUserData.full_name || null,
              role: newUserData.role,
              is_org_admin: newUserData.is_org_admin,
            } as any)
            .eq("id", signupData.user.id);

          if (updateError) throw updateError;
        }
      } else if (authData.user) {
        // If admin API worked, update the user profile
        const { error: updateError } = await supabase
          .from("users")
          .update({
            organization_id: id!,
            full_name: newUserData.full_name || null,
            role: newUserData.role,
            is_org_admin: newUserData.is_org_admin,
          } as any)
          .eq("id", authData.user.id);

        if (updateError) throw updateError;
      }

      toast({
        title: "Success",
        description: "User created successfully",
      });

      setIsAddUserDialogOpen(false);
      setNewUserData({
        email: "",
        full_name: "",
        role: "employee",
        is_org_admin: false,
        password: "",
      });
      fetchUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleOrgAdmin(user: User) {
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_org_admin: !user.is_org_admin } as any)
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${user.full_name || user.email} is ${!user.is_org_admin ? "now" : "no longer"} an organization admin`,
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Error",
        description: "Failed to update user",
        variant: "destructive",
      });
    }
  }

  async function toggleUserStatus(user: User) {
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: !user.is_active })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `User ${user.is_active ? "deactivated" : "activated"} successfully`,
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      });
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isSuperAdmin || !organization) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/super-admin/organizations")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          {organization.logo_url ? (
            <img
              src={organization.logo_url}
              alt={organization.name}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{organization.name}</h1>
            <p className="text-sm text-muted-foreground">
              <code className="bg-muted px-2 py-0.5 rounded">{organization.slug}</code>
              {" "}·{" "}
              <Badge variant={organization.is_active ? "default" : "secondary"}>
                {organization.is_active ? "Active" : "Inactive"}
              </Badge>
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsAddUserDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Organization Users</CardTitle>
              <CardDescription>
                Manage users in {organization.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Org Admin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.full_name || "No name"}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        {user.is_org_admin && (
                          <Badge variant="default" className="bg-amber-500">
                            <Shield className="h-3 w-3 mr-1" />
                            Org Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_active ? "default" : "secondary"}>
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleOrgAdmin(user)}
                          >
                            {user.is_org_admin ? "Remove Admin" : "Make Admin"}
                          </Button>
                          <Button
                            variant={user.is_active ? "destructive" : "default"}
                            size="sm"
                            onClick={() => toggleUserStatus(user)}
                          >
                            {user.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No users in this organization. Add the first user.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>
                Configure settings for {organization.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Organization Name</Label>
                  <p className="text-sm">{organization.name}</p>
                </div>
                <div className="space-y-2">
                  <Label>Slug (Login ID)</Label>
                  <p className="text-sm">
                    <code className="bg-muted px-2 py-1 rounded">{organization.slug}</code>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Created</Label>
                  <p className="text-sm">{organization.created_at ? new Date(organization.created_at).toLocaleString() : 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <p className="text-sm">
                    <Badge variant={organization.is_active ? "default" : "secondary"}>
                      {organization.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add User Dialog */}
      <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to {organization.name}</DialogTitle>
            <DialogDescription>
              Create a new user account for this organization
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="user@example.com"
                value={newUserData.email}
                onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Password</Label>
              <Input
                id="user-password"
                type="password"
                placeholder="••••••••"
                value={newUserData.password}
                onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-name">Full Name (optional)</Label>
              <Input
                id="user-name"
                placeholder="John Doe"
                value={newUserData.full_name}
                onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <Select
                value={newUserData.role}
                onValueChange={(value) => setNewUserData({ ...newUserData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is-org-admin"
                checked={newUserData.is_org_admin}
                onChange={(e) => setNewUserData({ ...newUserData, is_org_admin: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="is-org-admin" className="text-sm font-normal">
                Make this user an Organization Admin
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
