import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { 
  Plus, 
  Edit, 
  Trash2, 
  AlertTriangle, 
  Users, 
  Calendar, 
  MessageSquare, 
  TrendingUp,
  Eye,
  Copy,
  RefreshCw,
  Filter,
  Download,
  FileText,
  Settings,
  Target,
  Clock,
  CheckCircle,
  X
} from 'lucide-react';
import { format } from 'date-fns';

interface WarningMessage {
  id: string;
  title: string;
  message: string;
  severity: string | null;
  target_audience: string | null;
  target_user_ids: string[] | null;
  is_active: boolean | null;
  display_frequency: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string | null;
  created_by: string | null;
  organization_id?: string | null;
}

interface WarningTemplate {
  id: string;
  name: string;
  title: string;
  message: string;
  severity: string | null;
  category: string;
  description: string | null;
  is_system: boolean | null;
}

interface WarningLog {
  id: string;
  warning_message_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  shown_at: string | null;
  dismissed_at: string | null;
  action_taken: string | null;
  user_response: string | null;
  warning_messages?: { title: string } | null;
  [key: string]: any;
}

interface Employee {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function WarningManagement() {
  const [activeTab, setActiveTab] = useState('messages');
  const [warnings, setWarnings] = useState<WarningMessage[]>([]);
  const [templates, setTemplates] = useState<WarningTemplate[]>([]);
  const [logs, setLogs] = useState<WarningLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWarning, setEditingWarning] = useState<WarningMessage | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<{
    title: string;
    message: string;
    severity: string;
    target_audience: string;
    target_user_ids: string[];
    display_frequency: string;
    valid_from: string;
    valid_until: string;
    is_active: boolean;
  }>({
    title: '',
    message: '',
    severity: 'medium',
    target_audience: 'all',
    target_user_ids: [] as string[],
    display_frequency: 'always',
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: '',
    is_active: true
  });

  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const isAdmin = userDetails?.role === 'admin' || userDetails?.role === 'manager';

  useEffect(() => {
    if (isAdmin && userDetails) {
      fetchData();
    }
  }, [isAdmin, userDetails, organizationId, isSuperAdmin]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchWarningMessages(),
        fetchWarningTemplates(), 
        fetchWarningLogs(),
        fetchEmployees()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load warning management data');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarningMessages = async () => {
    let query = supabase
      .from('warning_messages')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Filter by organization for non-super admins
    if (organizationId && !isSuperAdmin) {
      query = query.eq('organization_id', organizationId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    setWarnings((data || []) as WarningMessage[]);
  };

  const fetchWarningTemplates = async () => {
    const { data, error } = await supabase
      .from('warning_templates')
      .select('*')
      .order('category', { ascending: true });
    
    if (error) throw error;
    setTemplates(data || []);
  };

  const fetchWarningLogs = async () => {
    let query = supabase
      .from('warning_logs')
      .select(`
        *,
        users:user_id (
          full_name,
          email,
          organization_id
        ),
        warning_messages:warning_message_id (
          title
        )
      `)
      .order('shown_at', { ascending: false })
      .limit(100);
    
    // Filter by user's organization for non-super admins
    if (organizationId && !isSuperAdmin) {
      query = query.eq('users.organization_id', organizationId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    const processedLogs = (data || []).map(log => ({
      ...log,
      user_name: log.users?.full_name || 'Unknown User',
      user_email: log.users?.email || 'unknown@email.com'
    }));
    
    setLogs(processedLogs);
  };

  const fetchEmployees = async () => {
    let query = supabase
      .from('users')
      .select('id, full_name, email, role, organization_id')
      .in('role', ['employee', 'admin', 'manager'])
      .order('full_name');
    
    // Filter by organization for non-super admins
    if (organizationId && !isSuperAdmin) {
      query = query.eq('organization_id', organizationId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    setEmployees(data || []);
  };

  const handleCreateWarning = async () => {
    try {
      if (!formData.title || !formData.message) {
        toast.error('Please fill in all required fields');
        return;
      }

      const warningData = {
        ...formData,
        valid_from: formData.valid_from ? new Date(formData.valid_from).toISOString() : new Date().toISOString(),
        valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : null,
        created_by: userDetails?.id,
        organization_id: organizationId || null
      };

      const { error } = await supabase
        .from('warning_messages')
        .insert([warningData] as any);

      if (error) throw error;

      toast.success('Warning message created successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      fetchWarningMessages();
    } catch (error: any) {
      console.error('Error creating warning:', error);
      toast.error(error.message || 'Failed to create warning message');
    }
  };

  const handleUpdateWarning = async () => {
    if (!editingWarning) return;

    try {
      const warningData = {
        ...formData,
        valid_from: formData.valid_from ? new Date(formData.valid_from).toISOString() : new Date().toISOString(),
        valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : null,
      };

      const { error } = await supabase
        .from('warning_messages')
        .update(warningData)
        .eq('id', editingWarning.id);

      if (error) throw error;

      toast.success('Warning message updated successfully');
      setEditingWarning(null);
      resetForm();
      fetchWarningMessages();
    } catch (error: any) {
      console.error('Error updating warning:', error);
      toast.error(error.message || 'Failed to update warning message');
    }
  };

  const handleDeleteWarning = async (warningId: string) => {
    try {
      const { error } = await supabase
        .from('warning_messages')
        .delete()
        .eq('id', warningId);

      if (error) throw error;

      toast.success('Warning message deleted successfully');
      fetchWarningMessages();
    } catch (error: any) {
      console.error('Error deleting warning:', error);
      toast.error(error.message || 'Failed to delete warning message');
    }
  };

  const handleToggleActive = async (warningId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('warning_messages')
        .update({ is_active: isActive })
        .eq('id', warningId);

      if (error) throw error;

      toast.success(`Warning message ${isActive ? 'activated' : 'deactivated'}`);
      fetchWarningMessages();
    } catch (error: any) {
      console.error('Error toggling warning status:', error);
      toast.error('Failed to update warning status');
    }
  };

  const loadTemplate = (template: WarningTemplate) => {
    setFormData({
      ...formData,
      title: template.title,
      message: template.message,
      severity: template.severity || 'medium'
    });
  };

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
      severity: 'medium',
      target_audience: 'all',
      target_user_ids: [],
      display_frequency: 'always',
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: '',
      is_active: true
    });
  };

  const openEditDialog = (warning: WarningMessage) => {
    setEditingWarning(warning);
    setFormData({
      title: warning.title,
      message: warning.message,
      severity: warning.severity || 'medium',
      target_audience: warning.target_audience || 'all',
      target_user_ids: warning.target_user_ids || [],
      display_frequency: warning.display_frequency || 'always',
      valid_from: warning.valid_from ? new Date(warning.valid_from).toISOString().split('T')[0] : '',
      valid_until: warning.valid_until ? new Date(warning.valid_until).toISOString().split('T')[0] : '',
      is_active: warning.is_active ?? true
    });
    setIsCreateDialogOpen(true);
  };

  const getSeverityBadge = (severity: string) => {
    const variants = {
      critical: 'destructive' as const,
      high: 'destructive' as const,
      medium: 'secondary' as const,
      low: 'outline' as const
    };
    return <Badge variant={variants[severity as keyof typeof variants] || 'outline'}>{severity.toUpperCase()}</Badge>;
  };

  const exportWarningLogs = () => {
    const csvData = [
      ['Date', 'User', 'Email', 'Warning Title', 'Action', 'Response'],
      ...logs.map(log => [
        format(new Date(log.shown_at || ''), 'yyyy-MM-dd HH:mm'),
        log.user_name,
        log.user_email,
        log.warning_messages?.title || 'Unknown',
        log.action_taken || 'shown',
        log.user_response || ''
      ])
    ];

    const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `warning-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
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
            <MessageSquare className="h-8 w-8" />
            Warning Management System
          </h1>
          <p className="text-muted-foreground">Create and manage employee notifications and warnings</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setEditingWarning(null); }}>
                <Plus className="h-4 w-4 mr-2" />
                Create Warning
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingWarning ? 'Edit Warning Message' : 'Create New Warning Message'}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Template Selection */}
                {!editingWarning && (
                  <div>
                    <Label>Use Template (Optional)</Label>
                    <Select onValueChange={(templateId) => {
                      const template = templates.find(t => t.id === templateId);
                      if (template) loadTemplate(template);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex items-center gap-2">
                              {getSeverityBadge(template.severity || 'medium')}
                              <span>{template.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Warning Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      placeholder="Enter warning title..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="severity">Severity Level</Label>
                    <Select value={formData.severity} onValueChange={(value: any) => setFormData({...formData, severity: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="message">Warning Message *</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    placeholder="Enter the warning message that employees will see..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* Targeting */}
                <div className="space-y-3">
                  <Label>Target Audience</Label>
                  <Select value={formData.target_audience} onValueChange={(value: any) => setFormData({...formData, target_audience: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="employee">Employees Only</SelectItem>
                      <SelectItem value="specific">Specific Users</SelectItem>
                    </SelectContent>
                  </Select>

                  {formData.target_audience === 'specific' && (
                    <div>
                      <Label>Select Specific Users</Label>
                      <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
                        {employees.map(employee => (
                          <div key={employee.id} className="flex items-center space-x-2 py-1">
                            <Checkbox
                              checked={formData.target_user_ids.includes(employee.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFormData({
                                    ...formData,
                                    target_user_ids: [...formData.target_user_ids, employee.id]
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    target_user_ids: formData.target_user_ids.filter(id => id !== employee.id)
                                  });
                                }
                              }}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{employee.full_name}</div>
                              <div className="text-sm text-muted-foreground">{employee.email}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Display Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Display Frequency</Label>
                    <Select value={formData.display_frequency} onValueChange={(value: any) => setFormData({...formData, display_frequency: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">Every Time</SelectItem>
                        <SelectItem value="once">Only Once</SelectItem>
                        <SelectItem value="daily">Once Per Day</SelectItem>
                        <SelectItem value="weekly">Once Per Week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                    />
                    <Label>Active</Label>
                  </div>
                </div>

                {/* Validity Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="valid_from">Valid From</Label>
                    <Input
                      id="valid_from"
                      type="date"
                      value={formData.valid_from}
                      onChange={(e) => setFormData({...formData, valid_from: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="valid_until">Valid Until (Optional)</Label>
                    <Input
                      id="valid_until"
                      type="date"
                      value={formData.valid_until}
                      onChange={(e) => setFormData({...formData, valid_until: e.target.value})}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={editingWarning ? handleUpdateWarning : handleCreateWarning}>
                    {editingWarning ? 'Update Warning' : 'Create Warning'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="messages">Warning Messages</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Warning Messages Tab */}
        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Active Warning Messages
                <Badge variant="secondary">{warnings.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading warning messages...</div>
              ) : warnings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No warning messages created yet. Click "Create Warning" to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {warnings.map(warning => (
                    <div key={warning.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-medium">{warning.title}</h3>
                            {getSeverityBadge(warning.severity || 'medium')}
                            <Badge variant={warning.is_active ? 'default' : 'secondary'}>
                              {warning.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant="outline">{warning.target_audience}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{warning.message}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Display: {warning.display_frequency}</span>
                            <span>Created: {warning.created_at ? format(new Date(warning.created_at), 'MMM dd, yyyy') : 'N/A'}</span>
                            {warning.valid_until && (
                              <span>Expires: {format(new Date(warning.valid_until), 'MMM dd, yyyy')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={warning.is_active ?? false}
                            onCheckedChange={(checked) => handleToggleActive(warning.id, checked)}
                          />
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(warning)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Warning Message</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this warning message? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteWarning(warning.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Warning Templates
                <Badge variant="secondary">{templates.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map(template => (
                  <div key={template.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium">{template.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
                          {getSeverityBadge(template.severity || 'medium')}
                          <Badge variant="outline">{template.category}</Badge>
                        </div>
                        <p className="text-sm font-medium mb-1">{template.title}</p>
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => loadTemplate(template)}
                        title="Use this template"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Warning Activity Logs
                  <Badge variant="secondary">{logs.length}</Badge>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={exportWarningLogs}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading warning logs...
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No warning activity logs available yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 text-left">Date & Time</th>
                        <th className="border p-2 text-left">Employee</th>
                        <th className="border p-2 text-left">Warning</th>
                        <th className="border p-2 text-left">Action</th>
                        <th className="border p-2 text-left">Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.slice(0, 50).map(log => (
                        <tr key={log.id} className="hover:bg-muted/50">
                          <td className="border p-2 text-sm">
                            {log.shown_at ? format(new Date(log.shown_at), 'MMM dd, yyyy HH:mm') : 'N/A'}
                          </td>
                          <td className="border p-2">
                            <div className="text-sm">
                              <div className="font-medium">{log.user_name}</div>
                              <div className="text-muted-foreground">{log.user_email}</div>
                            </div>
                          </td>
                          <td className="border p-2 text-sm">
                            {log.warning_messages?.title || 'Unknown Warning'}
                          </td>
                          <td className="border p-2">
                            {(() => {
                              const action = log.action_taken || 'shown';
                              switch (action) {
                                case 'acknowledged':
                                  return (
                                    <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-300">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Acknowledged
                                    </Badge>
                                  );
                                case 'dismissed':
                                  return (
                                    <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-300">
                                      <X className="h-3 w-3 mr-1" />
                                      Dismissed
                                    </Badge>
                                  );
                                default:
                                  return (
                                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 border-blue-300">
                                      <Eye className="h-3 w-3 mr-1" />
                                      Shown
                                    </Badge>
                                  );
                              }
                            })()}
                          </td>
                          <td className="border p-2 text-sm">
                            {log.user_response ? (
                              <span className="text-muted-foreground italic">
                                {log.user_response.length > 50 
                                  ? `${log.user_response.substring(0, 50)}...` 
                                  : log.user_response}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No response</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {logs.length > 50 && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      Showing latest 50 logs. Export CSV to see all data.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Warning Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Active Warnings:</span>
                    <span className="font-medium">{warnings.filter(w => w.is_active).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Messages:</span>
                    <span className="font-medium">{warnings.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Critical Warnings:</span>
                    <span className="font-medium text-red-600">
                      {warnings.filter(w => w.severity === 'critical').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Activity Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Views:</span>
                    <span className="font-medium">{logs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Acknowledged:</span>
                    <span className="font-medium text-green-600">
                      {logs.filter(l => l.action_taken === 'acknowledged').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dismissed:</span>
                    <span className="font-medium text-orange-600">
                      {logs.filter(l => l.action_taken === 'dismissed').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {logs.slice(0, 5).map(log => (
                    <div key={log.id} className="text-sm">
                      <div className="font-medium">{log.user_name}</div>
                      <div className="text-muted-foreground">
                        {log.action_taken} warning {log.shown_at ? format(new Date(log.shown_at), 'MMM dd, HH:mm') : 'N/A'}
                      </div>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="text-muted-foreground text-sm">No recent activity</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 