import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { Settings, DollarSign, Camera, User, Save, Trash2, Plus, Edit, FolderOpen, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface User {
  id: string;
  email: string;
  full_name: string;
  custom_screenshot_interval_seconds: number | null;
}

interface SalarySettings {
  id?: string;
  user_id: string;
  salary_type: 'hourly' | 'monthly';
  hourly_rate: number;
  monthly_salary: number;
  minimum_hours_monthly: number;
  overtime_rate: number;
  screenshot_frequency_seconds: number;
  effective_from: string;
  notes: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
}

interface ProjectAssignment {
  id: string;
  user_id: string;
  project_id: string;
  projects: Project | null;
}

export default function EmployeeSettingsPage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [employees, setEmployees] = useState<User[]>([]);
  const [salarySettings, setSalarySettings] = useState<SalarySettings[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectAssignments, setProjectAssignments] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [managingProjects, setManagingProjects] = useState<string | null>(null);
  const [currentSettings, setCurrentSettings] = useState<SalarySettings>({
    user_id: '',
    salary_type: 'monthly',
    hourly_rate: 0,
    monthly_salary: 0,
    minimum_hours_monthly: 160,
    overtime_rate: 0,
    screenshot_frequency_seconds: 300,
    effective_from: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      fetchEmployees();
      fetchSalarySettings();
      fetchProjects();
      fetchProjectAssignments();
    }
  }, [userDetails, organizationId, isSuperAdmin]);

  const fetchEmployees = async () => {
    try {
      let query = supabase
        .from('users')
        .select('id, email, full_name, custom_screenshot_interval_seconds, role, organization_id')
        .in('role', ['employee', 'admin', 'manager'])
        .order('full_name');

      // Filter by organization for non-super admins
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to fetch employees');
    }
  };

  const fetchSalarySettings = async () => {
    try {
      // Fetch salary settings with user info to filter by organization
      const { data, error } = await (supabase as any)
        .from('employee_salary_settings')
        .select(`
          *,
          users:user_id (
            id,
            organization_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter by organization for non-super admins
      let filteredData = data || [];
      if (organizationId && !isSuperAdmin) {
        filteredData = filteredData.filter(
          (setting: any) => setting.users?.organization_id === organizationId
        );
      }
      
      setSalarySettings(filteredData);
    } catch (error) {
      console.error('Error fetching salary settings:', error);
      toast.error('Failed to fetch salary settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      let query = supabase
        .from('projects')
        .select('id, name, description, organization_id')
        .order('name');

      // Filter by organization for non-super admins
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('Failed to fetch projects');
    }
  };

  const fetchProjectAssignments = async () => {
    try {
      let query = supabase
        .from('employee_project_assignments')
        .select(`
          id,
          user_id,
          project_id,
          projects (
            id,
            name,
            description,
            organization_id
          )
        `);

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter by organization - only show assignments where the project belongs to the organization
      let filteredData = data || [];
      if (organizationId && !isSuperAdmin) {
        filteredData = filteredData.filter(
          (assignment: any) => assignment.projects?.organization_id === organizationId
        );
      }
      
      setProjectAssignments(filteredData);
    } catch (error) {
      console.error('Error fetching project assignments:', error);
      toast.error('Failed to fetch project assignments');
    }
  };

  const updateScreenshotFrequency = async (userId: string, frequency: number) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ custom_screenshot_interval_seconds: frequency })
        .eq('id', userId);

      if (error) throw error;
      
      toast.success('Screenshot frequency updated successfully');
      fetchEmployees();
    } catch (error) {
      console.error('Error updating screenshot frequency:', error);
      toast.error('Failed to update screenshot frequency');
    }
  };

  const openEditDialog = (userId: string) => {
    const existingSetting = salarySettings.find(s => s.user_id === userId);
    if (existingSetting) {
      setCurrentSettings(existingSetting);
    } else {
      setCurrentSettings({
        user_id: userId,
        salary_type: 'monthly',
        hourly_rate: 0,
        monthly_salary: 0,
        minimum_hours_monthly: 160,
        overtime_rate: 0,
        screenshot_frequency_seconds: 300,
        effective_from: new Date().toISOString().split('T')[0],
        notes: ''
      });
    }
    setEditingEmployee(userId);
  };

  const saveSalarySettings = async () => {
    try {
      if (currentSettings.id) {
        // Update existing
        const { error } = await (supabase as any)
          .from('employee_salary_settings')
          .update({
            salary_type: currentSettings.salary_type,
            hourly_rate: currentSettings.hourly_rate,
            monthly_salary: currentSettings.monthly_salary,
            minimum_hours_monthly: currentSettings.minimum_hours_monthly,
            overtime_rate: currentSettings.overtime_rate,
            screenshot_frequency_seconds: currentSettings.screenshot_frequency_seconds,
            effective_from: currentSettings.effective_from,
            notes: currentSettings.notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSettings.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await (supabase as any)
          .from('employee_salary_settings')
          .insert([currentSettings]);

        if (error) throw error;
      }

      // Also update the screenshot frequency in users table
      await updateScreenshotFrequency(currentSettings.user_id, currentSettings.screenshot_frequency_seconds);

      toast.success('Employee settings saved successfully');
      setEditingEmployee(null);
      fetchSalarySettings();
      fetchEmployees();
    } catch (error) {
      console.error('Error saving salary settings:', error);
      toast.error('Failed to save employee settings');
    }
  };

  const deleteSalarySettings = async (settingsId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('employee_salary_settings')
        .delete()
        .eq('id', settingsId);

      if (error) throw error;
      
      toast.success('Employee settings deleted successfully');
      fetchSalarySettings();
    } catch (error) {
      console.error('Error deleting salary settings:', error);
      toast.error('Failed to delete employee settings');
    }
  };

  const getEmployeeSetting = (userId: string): SalarySettings | null => {
    return salarySettings.find(s => s.user_id === userId) || null;
  };

  const formatInterval = (seconds: number | null): string => {
    if (!seconds) return '5 minutes (default)';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (minutes === 0) return `${remainingSeconds}s`;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const assignProjectToEmployee = async (userId: string, projectId: string) => {
    try {
      const { error } = await supabase
        .from('employee_project_assignments')
        .insert({
          user_id: userId,
          project_id: projectId
        });

      if (error) throw error;
      
      toast.success('Project assigned successfully');
      fetchProjectAssignments();
    } catch (error) {
      console.error('Error assigning project:', error);
      toast.error('Failed to assign project');
    }
  };

  const removeProjectFromEmployee = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('employee_project_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      
      toast.success('Project removed successfully');
      fetchProjectAssignments();
    } catch (error) {
      console.error('Error removing project:', error);
      toast.error('Failed to remove project');
    }
  };

  const getEmployeeProjects = (userId: string): ProjectAssignment[] => {
    return projectAssignments.filter(assignment => assignment.user_id === userId);
  };

  const getAvailableProjects = (userId: string): Project[] => {
    const assignedProjectIds = getEmployeeProjects(userId).map(assignment => assignment.project_id);
    return projects.filter(project => !assignedProjectIds.includes(project.id));
  };

  if (userDetails?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Employee Settings
          </h1>
          <p className="text-muted-foreground">Manage project assignments, screenshot frequency, and salary settings for employees</p>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{employees.length}</div>
              <div className="text-sm text-muted-foreground">Total Employees</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{projects.length}</div>
              <div className="text-sm text-muted-foreground">Total Projects</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{projectAssignments.length}</div>
              <div className="text-sm text-muted-foreground">Project Assignments</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{salarySettings.length}</div>
              <div className="text-sm text-muted-foreground">Configured Settings</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Settings List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Employee Configuration
          </CardTitle>
          <CardDescription>
            Configure project assignments, salary and screenshot monitoring settings for each employee
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading employee settings...</div>
          ) : (
            <div className="space-y-4">
              {employees.map((employee) => {
                const settings = getEmployeeSetting(employee.id);
                return (
                  <div key={employee.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{employee.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{employee.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <Dialog open={editingEmployee === employee.id} onOpenChange={(open) => !open && setEditingEmployee(null)}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openEditDialog(employee.id)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              {settings ? 'Edit' : 'Configure'}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Employee Settings - {employee.full_name}</DialogTitle>
                              <DialogDescription>
                                Configure salary and monitoring settings for this employee
                              </DialogDescription>
                            </DialogHeader>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Salary Settings */}
                              <div className="space-y-4">
                                <h4 className="font-medium flex items-center gap-2">
                                  <DollarSign className="h-4 w-4" />
                                  Salary Configuration
                                </h4>
                                
                                <div>
                                  <Label htmlFor="salary_type">Salary Type</Label>
                                  <Select
                                    value={currentSettings.salary_type}
                                    onValueChange={(value: 'hourly' | 'monthly') => 
                                      setCurrentSettings(prev => ({ ...prev, salary_type: value }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="hourly">Hourly Rate</SelectItem>
                                      <SelectItem value="monthly">Monthly Salary</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {currentSettings.salary_type === 'hourly' ? (
                                  <div>
                                    <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
                                    <Input
                                      id="hourly_rate"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={currentSettings.hourly_rate}
                                      onChange={(e) => setCurrentSettings(prev => ({ 
                                        ...prev, 
                                        hourly_rate: parseFloat(e.target.value) || 0 
                                      }))}
                                    />
                                  </div>
                                ) : (
                                  <div>
                                    <Label htmlFor="monthly_salary">Monthly Salary ($)</Label>
                                    <Input
                                      id="monthly_salary"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={currentSettings.monthly_salary}
                                      onChange={(e) => setCurrentSettings(prev => ({ 
                                        ...prev, 
                                        monthly_salary: parseFloat(e.target.value) || 0 
                                      }))}
                                    />
                                  </div>
                                )}

                                <div>
                                  <Label htmlFor="minimum_hours">Minimum Hours/Month</Label>
                                  <Input
                                    id="minimum_hours"
                                    type="number"
                                    min="0"
                                    value={currentSettings.minimum_hours_monthly}
                                    onChange={(e) => setCurrentSettings(prev => ({ 
                                      ...prev, 
                                      minimum_hours_monthly: parseInt(e.target.value) || 0 
                                    }))}
                                  />
                                </div>

                                <div>
                                  <Label htmlFor="overtime_rate">Overtime Rate ($)</Label>
                                  <Input
                                    id="overtime_rate"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={currentSettings.overtime_rate}
                                    onChange={(e) => setCurrentSettings(prev => ({ 
                                      ...prev, 
                                      overtime_rate: parseFloat(e.target.value) || 0 
                                    }))}
                                  />
                                  <p className="text-xs text-muted-foreground">For hours above minimum</p>
                                </div>

                                <div>
                                  <Label htmlFor="effective_from">Effective From</Label>
                                  <Input
                                    id="effective_from"
                                    type="date"
                                    value={currentSettings.effective_from}
                                    onChange={(e) => setCurrentSettings(prev => ({ 
                                      ...prev, 
                                      effective_from: e.target.value 
                                    }))}
                                  />
                                </div>
                              </div>

                              {/* Monitoring Settings */}
                              <div className="space-y-4">
                                <h4 className="font-medium flex items-center gap-2">
                                  <Camera className="h-4 w-4" />
                                  Monitoring Configuration
                                </h4>

                                <div>
                                  <Label htmlFor="screenshot_frequency">Screenshot Frequency (seconds)</Label>
                                  <Select
                                    value={currentSettings.screenshot_frequency_seconds.toString()}
                                    onValueChange={(value) => 
                                      setCurrentSettings(prev => ({ 
                                        ...prev, 
                                        screenshot_frequency_seconds: parseInt(value) 
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="60">1 minute (High monitoring)</SelectItem>
                                      <SelectItem value="120">2 minutes</SelectItem>
                                      <SelectItem value="180">3 minutes</SelectItem>
                                      <SelectItem value="300">5 minutes (Standard)</SelectItem>
                                      <SelectItem value="600">10 minutes</SelectItem>
                                      <SelectItem value="900">15 minutes (Low monitoring)</SelectItem>
                                      <SelectItem value="1800">30 minutes (Minimal)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    Lower intervals = more monitoring and storage
                                  </p>
                                </div>

                                <div>
                                  <Label htmlFor="notes">Notes</Label>
                                  <Textarea
                                    id="notes"
                                    placeholder="Any additional notes about this employee's settings..."
                                    value={currentSettings.notes}
                                    onChange={(e) => setCurrentSettings(prev => ({ 
                                      ...prev, 
                                      notes: e.target.value 
                                    }))}
                                    className="h-32"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                              <Button variant="outline" onClick={() => setEditingEmployee(null)}>
                                Cancel
                              </Button>
                              <Button onClick={saveSalarySettings}>
                                <Save className="h-4 w-4 mr-2" />
                                Save Settings
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        
                        <Dialog open={managingProjects === employee.id} onOpenChange={(open) => !open && setManagingProjects(null)}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setManagingProjects(employee.id)}
                            >
                              <FolderOpen className="h-4 w-4 mr-2" />
                              Projects
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Manage Projects - {employee.full_name}</DialogTitle>
                              <DialogDescription>
                                Assign and remove projects for this employee
                              </DialogDescription>
                            </DialogHeader>
                            
                            <div className="space-y-6">
                              {/* Current Projects */}
                              <div>
                                <h4 className="font-medium mb-3">Assigned Projects</h4>
                                <div className="space-y-2">
                                  {getEmployeeProjects(employee.id).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No projects assigned</p>
                                  ) : (
                                    getEmployeeProjects(employee.id).map((assignment) => (
                                      <div key={assignment.id} className="flex items-center justify-between p-3 border rounded">
                                        <div>
                                          <span className="font-medium">{assignment.projects?.name}</span>
                                          {assignment.projects?.description && (
                                            <p className="text-sm text-muted-foreground">{assignment.projects.description}</p>
                                          )}
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => removeProjectFromEmployee(assignment.id)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* Available Projects */}
                              <div>
                                <h4 className="font-medium mb-3">Available Projects</h4>
                                <div className="space-y-2">
                                  {getAvailableProjects(employee.id).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">All projects are already assigned</p>
                                  ) : (
                                    getAvailableProjects(employee.id).map((project) => (
                                      <div key={project.id} className="flex items-center justify-between p-3 border rounded">
                                        <div>
                                          <span className="font-medium">{project.name}</span>
                                          {project.description && (
                                            <p className="text-sm text-muted-foreground">{project.description}</p>
                                          )}
                                        </div>
                                        <Button
                                          variant="default"
                                          size="sm"
                                          onClick={() => assignProjectToEmployee(employee.id, project.id)}
                                        >
                                          <Plus className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        {settings && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => deleteSalarySettings(settings.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Screenshot Frequency:</span>
                        <br />
                        <Badge variant="outline">
                          {formatInterval(employee.custom_screenshot_interval_seconds)}
                        </Badge>
                      </div>
                      
                      <div>
                        <span className="font-medium">Salary Type:</span>
                        <br />
                        {settings ? (
                          <Badge variant={settings.salary_type === 'hourly' ? 'default' : 'secondary'}>
                            {settings.salary_type === 'hourly' 
                              ? `$${settings.hourly_rate}/hour` 
                              : `$${settings.monthly_salary}/month`
                            }
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not configured</Badge>
                        )}
                      </div>
                      
                      <div>
                        <span className="font-medium">Min Hours/Month:</span>
                        <br />
                        <Badge variant="outline">
                          {settings ? `${settings.minimum_hours_monthly}h` : 'Not set'}
                        </Badge>
                      </div>

                      <div>
                        <span className="font-medium">Assigned Projects:</span>
                        <br />
                        {(() => {
                          const assignedProjects = getEmployeeProjects(employee.id);
                          return assignedProjects.length === 0 ? (
                            <Badge variant="outline">No projects</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {assignedProjects.slice(0, 2).map((assignment) => (
                                <Badge key={assignment.id} variant="default" className="text-xs">
                                  {assignment.projects?.name}
                                </Badge>
                              ))}
                              {assignedProjects.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{assignedProjects.length - 2} more
                                </Badge>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {settings?.notes && (
                      <div className="text-sm">
                        <span className="font-medium">Notes:</span>
                        <p className="text-muted-foreground mt-1">{settings.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 