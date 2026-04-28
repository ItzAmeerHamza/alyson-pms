import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { DollarSign, Calculator, TrendingDown, TrendingUp, Users, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { calculateSessionHours } from '@/lib/time-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WarningsDeductions from '@/components/finance/warnings-deductions';

interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface SalarySettings {
  id: string;
  user_id: string;
  salary_type: 'hourly' | 'monthly';
  hourly_rate: number;
  monthly_salary: number;
  minimum_hours_monthly: number;
  overtime_rate: number;
}

interface PayrollRecord {
  id?: string;
  user_id: string;
  month_year: string;
  total_hours_worked: number;
  regular_hours: number;
  overtime_hours: number;
  base_salary: number;
  overtime_pay: number;
  deductions: number;
  final_salary: number;
  is_paid: boolean;
  paid_at?: string;
  notes: string;
}

interface WorkHours {
  user_id: string;
  total_hours: number;
}

export default function FinancePage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salarySettings, setSalarySettings] = useState<SalarySettings[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [workHours, setWorkHours] = useState<WorkHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [calculating, setCalculating] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<PayrollRecord | null>(null);

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      fetchData();
    }
  }, [userDetails, selectedMonth, organizationId, isSuperAdmin]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([
      fetchEmployees(),
      fetchSalarySettings(),
      fetchPayrollRecords(),
      fetchWorkHours()
    ]);
    setLoading(false);
  };

  const fetchEmployees = async () => {
    try {
      let query = supabase
        .from('users')
        .select('id, email, full_name, role')
        .in('role', ['employee', 'admin', 'manager']);
      
      // Filter by organization unless super admin
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
        `);

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
    }
  };

  const fetchPayrollRecords = async () => {
    try {
      const monthStart = `${selectedMonth}-01`;
      // Fetch payroll records with user info to filter by organization
      const { data, error } = await (supabase as any)
        .from('employee_payroll')
        .select(`
          *,
          users:user_id (
            id,
            organization_id
          )
        `)
        .eq('month_year', monthStart);

      if (error) throw error;
      
      // Filter by organization for non-super admins
      let filteredData = data || [];
      if (organizationId && !isSuperAdmin) {
        filteredData = filteredData.filter(
          (record: any) => record.users?.organization_id === organizationId
        );
      }
      
      setPayrollRecords(filteredData);
    } catch (error) {
      console.error('Error fetching payroll records:', error);
      toast.error('Failed to fetch payroll records');
    }
  };

  const fetchWorkHours = async () => {
    try {
      const startDate = startOfMonth(new Date(selectedMonth + '-01'));
      const endDate = endOfMonth(startDate);

      // Build query with org filter pushed to DB level
      let timeQuery = supabase
        .from('time_logs')
        .select('user_id, start_time, end_time')
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .not('end_time', 'is', null);

      // Scope to org employees at DB level using the already-fetched employees list
      if (organizationId && !isSuperAdmin && employees.length > 0) {
        const empIds = employees.map(e => e.id);
        timeQuery = timeQuery.in('user_id', empIds);
      }

      const filteredData = await fetchPaginated<any>(timeQuery);

      // Calculate total hours per user
      const hoursMap = new Map<string, number>();
      
      filteredData.forEach((log: any) => {
        const hours = calculateSessionHours(log.start_time, log.end_time);
        
        if (hours > 0) {
          const currentHours = hoursMap.get(log.user_id) || 0;
          hoursMap.set(log.user_id, currentHours + hours);
        }
      });

      const workHoursData: WorkHours[] = Array.from(hoursMap.entries()).map(([user_id, total_hours]) => ({
        user_id,
        total_hours: Math.round(total_hours * 100) / 100 // Round to 2 decimal places
      }));

      setWorkHours(workHoursData);
    } catch (error) {
      console.error('Error fetching work hours:', error);
      toast.error('Failed to fetch work hours');
    }
  };

  const calculatePayroll = async () => {
    setCalculating(true);
    try {
      const monthStart = `${selectedMonth}-01`;
      const newPayrollRecords: PayrollRecord[] = [];

      for (const employee of employees) {
        const settings = salarySettings.find(s => s.user_id === employee.id);
        const hours = workHours.find(h => h.user_id === employee.id);
        
        if (!settings) {
          toast.warning(`No salary settings found for ${employee.full_name}`);
          continue;
        }

        const totalHours = hours?.total_hours || 0;
        const minimumHours = settings.minimum_hours_monthly;
        
        let regularHours = 0;
        let overtimeHours = 0;
        let baseSalary = 0;
        let overtimePay = 0;
        let deductions = 0;

        if (settings.salary_type === 'hourly') {
          regularHours = Math.min(totalHours, minimumHours);
          overtimeHours = Math.max(0, totalHours - minimumHours);
          baseSalary = regularHours * settings.hourly_rate;
          overtimePay = overtimeHours * (settings.overtime_rate || settings.hourly_rate);
        } else {
          // Monthly salary
          baseSalary = settings.monthly_salary;
          
          if (totalHours < minimumHours) {
            // Apply deduction for not meeting minimum hours
            const shortfall = minimumHours - totalHours;
            const deductionRate = settings.monthly_salary / minimumHours;
            deductions = shortfall * deductionRate;
          } else {
            // Overtime for monthly employees
            overtimeHours = totalHours - minimumHours;
            overtimePay = overtimeHours * (settings.overtime_rate || 0);
          }
          
          regularHours = Math.min(totalHours, minimumHours);
        }

        const finalSalary = baseSalary + overtimePay - deductions;

        const payrollRecord: PayrollRecord = {
          user_id: employee.id,
          month_year: monthStart,
          total_hours_worked: totalHours,
          regular_hours: regularHours,
          overtime_hours: overtimeHours,
          base_salary: Math.round(baseSalary * 100) / 100,
          overtime_pay: Math.round(overtimePay * 100) / 100,
          deductions: Math.round(deductions * 100) / 100,
          final_salary: Math.round(finalSalary * 100) / 100,
          is_paid: false,
          notes: ''
        };

        newPayrollRecords.push(payrollRecord);
      }

      // Save to database
      const { error } = await (supabase as any)
        .from('employee_payroll')
        .upsert(newPayrollRecords, { 
          onConflict: 'user_id, month_year',
          ignoreDuplicates: false 
        });

      if (error) throw error;

      toast.success(`Payroll calculated for ${newPayrollRecords.length} employees`);
      fetchPayrollRecords();
    } catch (error) {
      console.error('Error calculating payroll:', error);
      toast.error('Failed to calculate payroll');
    } finally {
      setCalculating(false);
    }
  };

  const markAsPaid = async (payrollId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('employee_payroll')
        .update({ 
          is_paid: true, 
          paid_at: new Date().toISOString() 
        })
        .eq('id', payrollId);

      if (error) throw error;
      
      toast.success('Marked as paid');
      fetchPayrollRecords();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast.error('Failed to update payment status');
    }
  };

  const updatePayrollRecord = async (record: PayrollRecord) => {
    try {
      const { error } = await (supabase as any)
        .from('employee_payroll')
        .update(record)
        .eq('id', record.id);

      if (error) throw error;
      
      toast.success('Payroll record updated');
      setEditingPayroll(null);
      fetchPayrollRecords();
    } catch (error) {
      console.error('Error updating payroll record:', error);
      toast.error('Failed to update payroll record');
    }
  };

  const getEmployeeName = (userId: string): string => {
    const employee = employees.find(e => e.id === userId);
    return employee?.full_name || 'Unknown Employee';
  };

  const getSalarySettings = (userId: string): SalarySettings | null => {
    return salarySettings.find(s => s.user_id === userId) || null;
  };

  const getTotalPayroll = (): number => {
    return payrollRecords.reduce((sum, record) => sum + record.final_salary, 0);
  };

  const getPaidPayroll = (): number => {
    return payrollRecords
      .filter(record => record.is_paid)
      .reduce((sum, record) => sum + record.final_salary, 0);
  };

  const getUnpaidPayroll = (): number => {
    return payrollRecords
      .filter(record => !record.is_paid)
      .reduce((sum, record) => sum + record.final_salary, 0);
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
            <DollarSign className="h-8 w-8" />
            Finance & Payroll
          </h1>
          <p className="text-muted-foreground">Calculate and manage employee salaries and payments</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div>
            <Label htmlFor="month-select">Select Month</Label>
            <Input
              id="month-select"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-40"
            />
          </div>
          <Button 
            onClick={calculatePayroll} 
            disabled={calculating}
            className="mt-6"
          >
            <Calculator className="h-4 w-4 mr-2" />
            {calculating ? 'Calculating...' : 'Calculate Payroll'}
          </Button>
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
              <div className="text-2xl font-bold text-green-600">${getTotalPayroll().toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Total Payroll</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">${getPaidPayroll().toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Paid Amount</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">${getUnpaidPayroll().toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Unpaid Amount</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different sections */}
      <Tabs defaultValue="payroll" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payroll">Payroll Calculations</TabsTrigger>
          <TabsTrigger value="warnings">Warnings & Deductions</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Payroll for {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
              </CardTitle>
              <CardDescription>
                Employee salary calculations based on hours worked and settings
              </CardDescription>
            </CardHeader>
            <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading payroll data...</div>
          ) : payrollRecords.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No payroll records found for this month.</p>
              <Button onClick={calculatePayroll} disabled={calculating}>
                <Calculator className="h-4 w-4 mr-2" />
                Calculate Payroll
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {payrollRecords.map((record) => {
                const employee = employees.find(e => e.id === record.user_id);
                const settings = getSalarySettings(record.user_id);
                
                return (
                  <div key={record.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{getEmployeeName(record.user_id)}</h3>
                        <p className="text-sm text-muted-foreground">{employee?.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={record.is_paid ? 'default' : 'secondary'}>
                          {record.is_paid ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Paid
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </>
                          )}
                        </Badge>
                        {!record.is_paid && (
                          <Button 
                            size="sm" 
                            onClick={() => markAsPaid(record.id!)}
                          >
                            Mark as Paid
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setEditingPayroll(record)}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Hours Worked:</span>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="h-4 w-4" />
                          {record.total_hours_worked.toFixed(1)}h
                        </div>
                      </div>

                      <div>
                        <span className="font-medium">Base Salary:</span>
                        <div className="flex items-center gap-1 mt-1">
                          <DollarSign className="h-4 w-4" />
                          ${record.base_salary.toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <span className="font-medium">Overtime Pay:</span>
                        <div className="flex items-center gap-1 mt-1 text-green-600">
                          <TrendingUp className="h-4 w-4" />
                          ${record.overtime_pay.toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <span className="font-medium">Deductions:</span>
                        <div className="flex items-center gap-1 mt-1 text-red-600">
                          <TrendingDown className="h-4 w-4" />
                          ${record.deductions.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">Final Salary:</span>
                          <span className="text-lg font-bold text-green-600 ml-2">
                            ${record.final_salary.toFixed(2)}
                          </span>
                        </div>
                        
                        {settings && (
                          <div className="text-sm text-muted-foreground">
                            {settings.salary_type === 'hourly' 
                              ? `Hourly: $${settings.hourly_rate}/h` 
                              : `Monthly: $${settings.monthly_salary}`
                            }
                            {record.total_hours_worked < settings.minimum_hours_monthly && (
                              <div className="text-orange-600 flex items-center gap-1 mt-1">
                                <AlertTriangle className="h-3 w-3" />
                                Below minimum hours ({settings.minimum_hours_monthly}h)
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {record.notes && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        <span className="font-medium">Notes:</span> {record.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warnings">
          <WarningsDeductions selectedMonth={selectedMonth} />
        </TabsContent>
      </Tabs>

      {/* Edit Payroll Dialog */}
      {editingPayroll && (
        <Dialog open={!!editingPayroll} onOpenChange={() => setEditingPayroll(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Payroll - {getEmployeeName(editingPayroll.user_id)}</DialogTitle>
              <DialogDescription>
                Adjust payroll calculations and add notes
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="deductions">Additional Deductions ($)</Label>
                <Input
                  id="deductions"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingPayroll.deductions}
                  onChange={(e) => setEditingPayroll(prev => prev ? ({ 
                    ...prev, 
                    deductions: parseFloat(e.target.value) || 0,
                    final_salary: prev.base_salary + prev.overtime_pay - (parseFloat(e.target.value) || 0)
                  }) : null)}
                />
              </div>

              <div>
                <Label htmlFor="overtime_pay">Overtime Pay ($)</Label>
                <Input
                  id="overtime_pay"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingPayroll.overtime_pay}
                  onChange={(e) => setEditingPayroll(prev => prev ? ({ 
                    ...prev, 
                    overtime_pay: parseFloat(e.target.value) || 0,
                    final_salary: prev.base_salary + (parseFloat(e.target.value) || 0) - prev.deductions
                  }) : null)}
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any adjustments or notes for this payroll..."
                  value={editingPayroll.notes}
                  onChange={(e) => setEditingPayroll(prev => prev ? ({ 
                    ...prev, 
                    notes: e.target.value 
                  }) : null)}
                />
              </div>

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center font-semibold">
                  <span>Final Salary:</span>
                  <span className="text-lg text-green-600">
                    ${editingPayroll.final_salary.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setEditingPayroll(null)}>
                Cancel
              </Button>
              <Button onClick={() => updatePayrollRecord(editingPayroll)}>
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 