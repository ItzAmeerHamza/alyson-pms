// Employee Issues Breakdown Component
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  User, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Eye,
  Send,
  ChevronRight,
  Copy,
  Smartphone,
  Globe,
  Play,
  Gamepad2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { EmployeeIssuesSummary, IssueType } from '../types';
import { ISSUE_CATEGORIES } from '../constants';

interface EmployeeIssuesBreakdownProps {
  employees: EmployeeIssuesSummary[];
  loading?: boolean;
  onSelectEmployee?: (userId: string) => void;
}

// Map issue types to icons
const ISSUE_ICONS: Record<IssueType, React.ElementType> = {
  duplicate_screenshots: Copy,
  low_activity: TrendingDown,
  social_media_app: Smartphone,
  social_media_url: Globe,
  entertainment: Play,
  gaming: Gamepad2,
  excessive_idle: Clock,
};

// Trend icon component
function TrendIndicator({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  switch (trend) {
    case 'improving':
      return (
        <div className="flex items-center gap-1 text-green-600">
          <TrendingDown className="h-4 w-4" />
          <span className="text-xs">Improving</span>
        </div>
      );
    case 'declining':
      return (
        <div className="flex items-center gap-1 text-red-600">
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs">Declining</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1 text-gray-500">
          <Minus className="h-4 w-4" />
          <span className="text-xs">Stable</span>
        </div>
      );
  }
}

// Risk score badge
function RiskBadge({ score }: { score: number }) {
  let colorClass = '';
  let label = '';
  
  if (score >= 70) {
    colorClass = 'bg-red-100 text-red-800 border-red-200';
    label = 'High Risk';
  } else if (score >= 40) {
    colorClass = 'bg-orange-100 text-orange-800 border-orange-200';
    label = 'Medium Risk';
  } else if (score >= 20) {
    colorClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
    label = 'Low Risk';
  } else {
    colorClass = 'bg-green-100 text-green-800 border-green-200';
    label = 'Minimal';
  }

  return (
    <Badge variant="outline" className={`${colorClass} text-xs`}>
      {score} - {label}
    </Badge>
  );
}

// Issue type mini badges
function IssueTypeBadges({ issuesByType }: { issuesByType: Record<IssueType, number> }) {
  const activeTypes = (Object.entries(issuesByType) as [IssueType, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (activeTypes.length === 0) {
    return <span className="text-muted-foreground text-xs">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {activeTypes.slice(0, 3).map(([type, count]) => {
        const Icon = ISSUE_ICONS[type];
        const category = ISSUE_CATEGORIES[type];
        
        return (
          <div
            key={type}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${category.bgColor} ${category.color}`}
            title={`${category.label}: ${count}`}
          >
            <Icon className="h-3 w-3" />
            <span>{count}</span>
          </div>
        );
      })}
      {activeTypes.length > 3 && (
        <span className="text-xs text-muted-foreground">+{activeTypes.length - 3}</span>
      )}
    </div>
  );
}

export function EmployeeIssuesBreakdown({ 
  employees, 
  loading,
  onSelectEmployee 
}: EmployeeIssuesBreakdownProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading employee data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (employees.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="py-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <User className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-base font-semibold text-green-900 mb-1">All Clear</h3>
            <p className="text-green-700 text-sm">
              No employees have activity issues in this period.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          Employee Issues Breakdown
        </CardTitle>
        <CardDescription>
          {employees.length} employee{employees.length !== 1 ? 's' : ''} with detected issues, sorted by risk score
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Employee</TableHead>
                <TableHead className="text-center">Issues</TableHead>
                <TableHead>Issue Types</TableHead>
                <TableHead className="text-center">Risk Score</TableHead>
                <TableHead className="text-center">Trend</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow 
                  key={employee.userId}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    employee.riskScore >= 70 ? 'bg-red-50/30' : 
                    employee.riskScore >= 40 ? 'bg-orange-50/30' : ''
                  }`}
                  onClick={() => onSelectEmployee?.(employee.userId)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        employee.riskScore >= 70 ? 'bg-red-100' :
                        employee.riskScore >= 40 ? 'bg-orange-100' :
                        'bg-blue-100'
                      }`}>
                        <User className={`h-5 w-5 ${
                          employee.riskScore >= 70 ? 'text-red-600' :
                          employee.riskScore >= 40 ? 'text-orange-600' :
                          'text-blue-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{employee.userName}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {employee.userEmail}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <span className={`text-lg font-bold ${
                      employee.totalIssues >= 5 ? 'text-red-600' :
                      employee.totalIssues >= 3 ? 'text-orange-600' :
                      'text-gray-900'
                    }`}>
                      {employee.totalIssues}
                    </span>
                  </TableCell>
                  
                  <TableCell>
                    <IssueTypeBadges issuesByType={employee.issuesByType} />
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <RiskBadge score={employee.riskScore} />
                      <Progress 
                        value={employee.riskScore} 
                        className="w-16 h-1.5"
                      />
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <TrendIndicator trend={employee.trend} />
                  </TableCell>
                  
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/screenshots?user=${employee.userId}`);
                        }}
                        title="View Screenshots"
                      >
                        <Eye className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/admin/warning-management');
                        }}
                        title="Send Warning"
                      >
                        <Send className="h-4 w-4 text-red-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ai-insights?user=${employee.userId}`);
                        }}
                        title="View AI Insights"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats at Bottom */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">
                High Risk: {employees.filter(e => e.riskScore >= 70).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-muted-foreground">
                Medium Risk: {employees.filter(e => e.riskScore >= 40 && e.riskScore < 70).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">
                Low Risk: {employees.filter(e => e.riskScore < 40).length}
              </span>
            </div>
          </div>
          
          {employees.length > 0 && employees.some(e => e.lastIssueAt) && (
            <p className="text-xs text-muted-foreground">
              Last issue: {format(
                new Date(employees.reduce((latest, e) => 
                  e.lastIssueAt && e.lastIssueAt > latest ? e.lastIssueAt : latest, 
                  employees[0].lastIssueAt || ''
                )),
                'MMM dd, yyyy HH:mm'
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

