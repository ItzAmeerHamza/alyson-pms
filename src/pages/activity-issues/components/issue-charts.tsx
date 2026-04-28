// Issue Charts Component - Trend visualizations
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { DetectedIssue, IssueSummaryStats, IssueType, IssueSeverity } from '../types';
import { ISSUE_CATEGORIES, SEVERITY_COLORS } from '../constants';

interface IssueChartsProps {
  stats: IssueSummaryStats;
  issues: DetectedIssue[];
  loading?: boolean;
}

// Colors for charts
const CHART_COLORS = {
  duplicate_screenshots: '#ef4444',
  low_activity: '#eab308',
  social_media_app: '#f97316',
  social_media_url: '#3b82f6',
  entertainment: '#a855f7',
  gaming: '#ec4899',
  excessive_idle: '#6b7280',
};

const SEVERITY_CHART_COLORS = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

export function IssueCharts({ stats, issues, loading }: IssueChartsProps) {
  // Prepare data for issue type distribution pie chart
  const issueTypeData = (Object.entries(stats.issuesByType) as [IssueType, number][])
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      name: ISSUE_CATEGORIES[type].label,
      value: count,
      color: CHART_COLORS[type],
    }));

  // Prepare data for severity distribution
  const severityData = (Object.entries(stats.issuesBySeverity) as [string, number][])
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => ({
      name: severity.charAt(0).toUpperCase() + severity.slice(1),
      value: count,
      color: SEVERITY_CHART_COLORS[severity as IssueSeverity] || '#6b7280',
    }));

  // Prepare data for issues by employee (top 10)
  const issuesByEmployee: Record<string, { name: string; count: number }> = {};
  issues.forEach(issue => {
    if (!issuesByEmployee[issue.userId]) {
      issuesByEmployee[issue.userId] = { name: issue.userName, count: 0 };
    }
    issuesByEmployee[issue.userId].count++;
  });

  const employeeData = Object.values(issuesByEmployee)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map(e => ({
      name: e.name.split(' ')[0], // First name only for space
      issues: e.count,
    }));

  // Custom tooltip for pie charts
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white px-3 py-2 shadow-lg rounded-lg border text-sm">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-muted-foreground">{payload[0].value} issues</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading charts...</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const hasData = stats.totalIssues > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Issue Type Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Issues by Type</CardTitle>
          <CardDescription>Distribution of detected issue categories</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No issues detected
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={issueTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {issueTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {hasData && (
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {issueTypeData.slice(0, 4).map((item, idx) => (
                <div key={idx} className="flex items-center gap-1 text-xs">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Severity Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Issues by Severity</CardTitle>
          <CardDescription>Breakdown by severity level</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No issues detected
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {hasData && (
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {severityData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1 text-xs">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issues by Employee Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Employees by Issues</CardTitle>
          <CardDescription>Employees with most detected issues</CardDescription>
        </CardHeader>
        <CardContent>
          {employeeData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No issues detected
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={employeeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" fontSize={10} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={60} 
                  fontSize={10}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value} issues`, 'Issues']}
                  contentStyle={{ fontSize: '12px' }}
                />
                <Bar 
                  dataKey="issues" 
                  fill="#ef4444" 
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

