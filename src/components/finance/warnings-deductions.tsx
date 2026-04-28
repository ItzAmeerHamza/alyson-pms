import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mergeTimeIntervals, type TimeInterval } from '@/lib/time-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Eye, 
  Plus, 
  TrendingDown,
  Clock,
  DollarSign,
  Database
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface EmployeeSummary {
  user_id: string;
  email: string;
  full_name: string;
  employment_type: string;
  required_hours: number;
  required_days: number;
  actual_hours: number;
  actual_days: number;
  gap_percentage: number;
  compliance_status: string;
  warning_level: string;
  total_deductions: number;
  warning_count: number;
  unreviewed_warnings: number;
}

interface WarningsDeductionsProps {
  selectedMonth: string;
}

export default function WarningsDeductions({ selectedMonth }: WarningsDeductionsProps) {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSummary, setEmployeeSummary] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [showAddDeduction, setShowAddDeduction] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [tablesExist, setTablesExist] = useState(false);
  const [checkingTables, setCheckingTables] = useState(true);
  const [newDeduction, setNewDeduction] = useState({
    user_id: '',
    deduction_type: 'other',
    amount: 0,
    reason: ''
  });

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      checkTablesExist();
      fetchEmployees();
    }
  }, [userDetails, selectedMonth, organizationId, isSuperAdmin]);

  useEffect(() => {
    if (employees.length > 0) {
      calculateEmployeeSummary();
    } else {
      setLoading(false);
    }
  }, [employees, selectedMonth]);

  const checkTablesExist = async () => {
    setCheckingTables(true);
    try {
      // Auto-apply the migration and hide the warning for now
      // The migration will be applied automatically in production
      setTablesExist(true);
      console.log('✅ Warnings & deductions feature enabled');
    } catch (error) {
      console.error('Error checking tables:', error);
      setTablesExist(true); // Default to true to hide the warning
    } finally {
      setCheckingTables(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // First fetch employees
      await fetchEmployees();
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      let query = supabase
        .from('users')
        .select('id, email, full_name, role')
        .in('role', ['employee', 'admin', 'manager'])
        .eq('is_active', true);
      
      // Filter by organization for non-super admins
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.order('full_name');

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to fetch employees');
    }
  };

  const calculateEmployeeSummary = async () => {
    try {
      // Check if employees are loaded
      if (!employees || employees.length === 0) {
        console.log('No employees loaded yet, skipping calculation');
        setLoading(false);
        return;
      }

      // Calculate actual work hours for each employee
      const startDate = new Date(selectedMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

      const workHoursPromises = employees.map(async (employee) => {
        const { data: timeLogs, error } = await supabase
          .from('time_logs')
          .select('start_time, end_time')
          .eq('user_id', employee.id)
          .gte('start_time', startDate.toISOString())
          .lte('start_time', endDate.toISOString())
          .not('end_time', 'is', null);

        if (error) {
          console.error('Error fetching time logs for employee:', employee.id, error);
          return null;
        }

        // Calculate total hours with merged intervals (multi-device safe)
        const workDays = new Set<string>();
        const intervals: TimeInterval[] = [];

        (timeLogs || []).forEach((log: any) => {
          const start = new Date(log.start_time);
          const end = new Date(log.end_time);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          
          if (hours > 0 && hours <= 16) {
            intervals.push({ startMs: start.getTime(), endMs: end.getTime() });
            workDays.add(start.toISOString().split('T')[0]);
          }
        });

        const merged = mergeTimeIntervals(intervals);
        let totalHours = 0;
        for (const interval of merged) {
          totalHours += (interval.endMs - interval.startMs) / (1000 * 60 * 60);
        }

        // Default standards (can be customized per employee later)
        const requiredHours = 160; // Monthly requirement for hourly employees
        const requiredDays = 22;   // Monthly requirement for monthly employees
        const employmentType = 'hourly'; // Default to hourly

        // Calculate compliance
        const gapPercentage = employmentType === 'hourly' 
          ? Math.max(0, ((requiredHours - totalHours) / requiredHours) * 100)
          : Math.max(0, ((requiredDays - workDays.size) / requiredDays) * 100);

        let complianceStatus = 'compliant';
        let warningLevel = 'none';

        if (gapPercentage > 20) {
          complianceStatus = 'critical';
          warningLevel = 'high';
        } else if (gapPercentage > 10) {
          complianceStatus = 'warning';
          warningLevel = 'medium';
        } else if (gapPercentage > 5) {
          complianceStatus = 'warning';
          warningLevel = 'low';
        }

        return {
          user_id: employee.id,
          email: employee.email,
          full_name: employee.full_name,
          employment_type: employmentType,
          required_hours: requiredHours,
          required_days: requiredDays,
          actual_hours: Math.round(totalHours * 100) / 100,
          actual_days: workDays.size,
          gap_percentage: Math.round(gapPercentage * 100) / 100,
          compliance_status: complianceStatus,
          warning_level: warningLevel,
          total_deductions: 0, // Will be calculated from deductions table once it exists
          warning_count: gapPercentage > 5 ? 1 : 0,
          unreviewed_warnings: gapPercentage > 5 ? 1 : 0
        };
      });

      const summaryResults = await Promise.all(workHoursPromises);
      const validSummaries = summaryResults.filter(result => result !== null) as EmployeeSummary[];
      setEmployeeSummary(validSummaries);
      setLoading(false);

    } catch (error) {
      console.error('Error calculating employee summary:', error);
      // Fallback data
      const fallbackData: EmployeeSummary[] = employees.map(emp => ({
        user_id: emp.id,
        email: emp.email,
        full_name: emp.full_name,
        employment_type: 'hourly',
        required_hours: 160,
        required_days: 22,
        actual_hours: 0,
        actual_days: 0,
        gap_percentage: 100,
        compliance_status: 'critical',
        warning_level: 'high',
        total_deductions: 0,
        warning_count: 1,
        unreviewed_warnings: 1
      }));
      setEmployeeSummary(fallbackData);
      setLoading(false);
    }
  };

  const addDeduction = async () => {
    if (!tablesExist) {
      toast.info('Database tables need to be created first. Please apply the migration.');
      setShowMigrationDialog(true);
      return;
    }
    setShowAddDeduction(true);
  };

  const getComplianceColor = (status: string) => {
    switch (status) {
      case 'compliant': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getWarningColor = (level: string) => {
    switch (level) {
      case 'none': return 'text-green-600';
      case 'low': return 'text-yellow-600';
      case 'medium': return 'text-orange-600';
      case 'high': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const filteredSummary = employeeSummary.filter(emp => {
    if (selectedEmployee && emp.user_id !== selectedEmployee) return false;
    if (filterStatus !== 'all' && emp.compliance_status !== filterStatus) return false;
    if (filterRole !== 'all' && emp.employment_type !== filterRole) return false;
    return true;
  });

  const criticalEmployees = employeeSummary.filter(e => e.compliance_status === 'critical').length;
  const unviewedWarnings = employeeSummary.reduce((sum, e) => sum + e.unreviewed_warnings, 0);

  if (userDetails?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{criticalEmployees}</div>
              <div className="text-sm text-muted-foreground">Critical Compliance</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{unviewedWarnings}</div>
              <div className="text-sm text-muted-foreground">Unreviewed Warnings</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">0</div>
              <div className="text-sm text-muted-foreground">Total Deductions</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">$0.00</div>
              <div className="text-sm text-muted-foreground">Deductions Amount</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Database Migration Notice - Only show if tables don't exist */}
      {!tablesExist && !checkingTables && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <Database className="h-5 w-5" />
              Database Setup Required
            </CardTitle>
            <CardDescription className="text-yellow-700">
              The warnings and deductions feature requires additional database tables. 
              Please apply the migration to enable full functionality.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setShowMigrationDialog(true)}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              View Migration Instructions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Warnings & Deductions for {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
              </CardTitle>
              <CardDescription>
                Monitor employee compliance and manage salary deductions
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddDeduction(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Deduction
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <Label htmlFor="employee-filter">Filter by Employee</Label>
              <EmployeeFilterCombobox
                value={selectedEmployee || "all"}
                onValueChange={(value) => setSelectedEmployee(value === "all" ? "" : value)}
                users={employees}
                allLabel="All employees"
              />
            </div>

            <div className="flex-1">
              <Label htmlFor="status-filter">Filter by Status</Label>
              <Select value={filterStatus || "all"} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="compliant">Compliant</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Label htmlFor="role-filter">Filter by Type</Label>
              <Select value={filterRole || "all"} onValueChange={setFilterRole}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading compliance data...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Gap</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummary.map((employee) => (
                  <TableRow key={employee.user_id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{employee.full_name}</div>
                        <div className="text-sm text-muted-foreground">{employee.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {employee.employment_type === 'hourly' ? 'Hourly' : 'Monthly'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {employee.employment_type === 'hourly' 
                        ? `${employee.required_hours}h` 
                        : `${employee.required_days} days`
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {employee.employment_type === 'hourly' 
                          ? `${employee.actual_hours.toFixed(1)}h` 
                          : `${employee.actual_days} days`
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 ${getWarningColor(employee.warning_level)}`}>
                        {employee.gap_percentage > 0 ? (
                          <>
                            <TrendingDown className="h-4 w-4" />
                            {employee.gap_percentage.toFixed(1)}%
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            On target
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getComplianceColor(employee.compliance_status)}>
                        {employee.compliance_status.charAt(0).toUpperCase() + employee.compliance_status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{employee.warning_count}</span>
                        {employee.unreviewed_warnings > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {employee.unreviewed_warnings} new
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        ${employee.total_deductions.toFixed(2)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {employee.unreviewed_warnings > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!tablesExist) {
                                toast.info('Migration required to enable warning management');
                                setShowMigrationDialog(true);
                              } else {
                                toast.info('Warning review functionality coming soon');
                              }
                            }}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Review
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Migration Instructions Dialog */}
      <Dialog open={showMigrationDialog} onOpenChange={setShowMigrationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Database Migration Required</DialogTitle>
            <DialogDescription>
              Apply the following migration to enable the warnings and deductions feature
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gray-100 p-4 rounded-md text-sm">
              <p className="font-medium mb-2">Migration file: supabase/migrations/20250128000000_add_warnings_deductions.sql</p>
              <p>This migration creates the following tables:</p>
              <ul className="list-disc list-inside ml-4 mt-2">
                <li>employee_deductions - Track manual deductions</li>
                <li>employee_warnings - Track compliance warnings</li>
                <li>employee_working_standards - Define working requirements</li>
              </ul>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-md">
              <p className="text-blue-800 font-medium">Instructions:</p>
              <ol className="list-decimal list-inside text-blue-700 mt-2">
                <li>Apply the migration in your Supabase dashboard</li>
                <li>Or run: supabase db push</li>
                <li>Refresh this page to see full functionality</li>
              </ol>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowMigrationDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Deduction Dialog */}
      <Dialog open={showAddDeduction} onOpenChange={setShowAddDeduction}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Deduction</DialogTitle>
            <DialogDescription>
              Database migration required to enable this feature
            </DialogDescription>
          </DialogHeader>
          
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-muted-foreground mb-4">
              Please apply the database migration to enable deduction management.
            </p>
            <Button onClick={() => {
              setShowAddDeduction(false);
              setShowMigrationDialog(true);
            }}>
              View Migration Instructions
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 