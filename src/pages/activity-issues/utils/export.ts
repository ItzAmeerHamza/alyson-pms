// Export utilities for Activity Issues
import { format } from 'date-fns';
import { DetectedIssue, EmployeeIssuesSummary, IssueSummaryStats, IssueType } from '../types';

// Inline issue type labels to avoid circular dependency with constants.ts
const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  duplicate_screenshots: 'Duplicate Screenshots',
  low_activity: 'Low Activity',
  social_media_app: 'Social Media Apps',
  social_media_url: 'Social Media Websites',
  entertainment: 'Entertainment',
  gaming: 'Gaming',
  excessive_idle: 'Excessive Idle',
};

/**
 * Convert issues to CSV format and trigger download
 */
export function exportIssuesToCSV(
  issues: DetectedIssue[],
  filename?: string
): void {
  const headers = [
    'Issue Type',
    'Severity',
    'Employee Name',
    'Employee Email',
    'Count',
    'Description',
    'Detected At',
  ];

  const rows = issues.map(issue => [
    ISSUE_TYPE_LABELS[issue.type],
    issue.severity,
    issue.userName,
    issue.userEmail,
    issue.count.toString(),
    issue.details.description.replace(/,/g, ';'), // Escape commas
    format(new Date(issue.detectedAt), 'yyyy-MM-dd HH:mm:ss'),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  downloadCSV(csvContent, filename || `activity-issues-${format(new Date(), 'yyyy-MM-dd')}.csv`);
}

/**
 * Export employee summaries to CSV
 */
export function exportEmployeeSummariesToCSV(
  employees: EmployeeIssuesSummary[],
  filename?: string
): void {
  const headers = [
    'Employee Name',
    'Employee Email',
    'Total Issues',
    'Risk Score',
    'Trend',
    'Duplicate Screenshots',
    'Low Activity',
    'Social Media Apps',
    'Social Media URLs',
    'Entertainment',
    'Gaming',
    'Excessive Idle',
    'Last Issue At',
  ];

  const rows = employees.map(emp => [
    emp.userName,
    emp.userEmail,
    emp.totalIssues.toString(),
    emp.riskScore.toString(),
    emp.trend,
    emp.issuesByType.duplicate_screenshots.toString(),
    emp.issuesByType.low_activity.toString(),
    emp.issuesByType.social_media_app.toString(),
    emp.issuesByType.social_media_url.toString(),
    emp.issuesByType.entertainment.toString(),
    emp.issuesByType.gaming.toString(),
    emp.issuesByType.excessive_idle.toString(),
    emp.lastIssueAt ? format(new Date(emp.lastIssueAt), 'yyyy-MM-dd HH:mm:ss') : '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  downloadCSV(csvContent, filename || `employee-issues-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`);
}

/**
 * Export full report including stats, issues, and employee summaries
 */
export function exportFullReport(
  stats: IssueSummaryStats,
  issues: DetectedIssue[],
  employees: EmployeeIssuesSummary[],
  dateRange: { start: Date; end: Date }
): void {
  const reportDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  const periodStart = format(dateRange.start, 'yyyy-MM-dd');
  const periodEnd = format(dateRange.end, 'yyyy-MM-dd');

  let content = '';

  // Header section
  content += 'ACTIVITY ISSUES REPORT\n';
  content += '=====================\n\n';
  content += `Generated: ${reportDate}\n`;
  content += `Period: ${periodStart} to ${periodEnd}\n\n`;

  // Summary section
  content += 'SUMMARY\n';
  content += '-------\n';
  content += `Total Issues: ${stats.totalIssues}\n`;
  content += `Employees Affected: ${stats.employeesAffected}\n`;
  content += `Average Risk Score: ${stats.averageRiskScore}\n`;
  content += `Most Common Issue: ${stats.mostCommonIssue ? ISSUE_TYPE_LABELS[stats.mostCommonIssue] : 'None'}\n\n`;

  // Issues by type
  content += 'ISSUES BY TYPE\n';
  content += '--------------\n';
  Object.entries(stats.issuesByType).forEach(([type, count]) => {
    if (count > 0) {
      content += `${ISSUE_TYPE_LABELS[type as IssueType]}: ${count}\n`;
    }
  });
  content += '\n';

  // Issues by severity
  content += 'ISSUES BY SEVERITY\n';
  content += '------------------\n';
  Object.entries(stats.issuesBySeverity).forEach(([severity, count]) => {
    if (count > 0) {
      content += `${severity.charAt(0).toUpperCase() + severity.slice(1)}: ${count}\n`;
    }
  });
  content += '\n';

  // Employee breakdown
  content += 'EMPLOYEE BREAKDOWN\n';
  content += '------------------\n';
  employees.forEach(emp => {
    content += `${emp.userName} (${emp.userEmail})\n`;
    content += `  Total Issues: ${emp.totalIssues}, Risk Score: ${emp.riskScore}, Trend: ${emp.trend}\n`;
  });
  content += '\n';

  // Detailed issues
  content += 'DETAILED ISSUES\n';
  content += '---------------\n';
  issues.forEach((issue, idx) => {
    content += `\n${idx + 1}. ${ISSUE_TYPE_LABELS[issue.type]} [${issue.severity.toUpperCase()}]\n`;
    content += `   Employee: ${issue.userName}\n`;
    content += `   Count: ${issue.count}\n`;
    content += `   Description: ${issue.details.description}\n`;
    content += `   Detected: ${format(new Date(issue.detectedAt), 'yyyy-MM-dd HH:mm:ss')}\n`;
  });

  // Download as text file
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity-issues-full-report-${format(new Date(), 'yyyy-MM-dd')}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Helper function to download CSV content
 */
function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

