// AI Recommendations for Activity Issues
import { IssueType, IssueSeverity, DetectedIssue } from '../types';

interface Recommendation {
  title: string;
  description: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Get AI-powered recommendations based on issue type and severity
 */
export function getRecommendation(issue: DetectedIssue): Recommendation {
  const { type, severity, count, details } = issue;

  // Base recommendations by type
  const recommendations: Record<IssueType, Recommendation[]> = {
    duplicate_screenshots: [
      {
        title: 'Review Work Patterns',
        description: 'Consecutive identical screenshots may indicate the employee is stuck on a task or inactive.',
        action: 'Schedule a check-in to understand if they need assistance or training.',
        priority: 'medium',
      },
      {
        title: 'Investigate Inactivity',
        description: 'High duplicate count suggests prolonged periods without meaningful work.',
        action: 'Review time logs and discuss workload distribution.',
        priority: 'high',
      },
    ],
    low_activity: [
      {
        title: 'Assess Engagement',
        description: 'Low keyboard/mouse activity may indicate disengagement or challenging work.',
        action: 'Have a conversation about current projects and potential blockers.',
        priority: 'medium',
      },
      {
        title: 'Check for Technical Issues',
        description: 'Very low activity could be due to system issues or waiting for resources.',
        action: 'Verify the employee has necessary tools and access.',
        priority: 'low',
      },
    ],
    social_media_app: [
      {
        title: 'Review Social Media Policy',
        description: 'Social media usage during work hours may affect productivity.',
        action: 'Remind employee of acceptable use policy and expected work hours.',
        priority: 'medium',
      },
      {
        title: 'Consider App Restrictions',
        description: 'Persistent social media usage may require intervention.',
        action: 'Evaluate implementing app usage policies or blocks during work hours.',
        priority: 'high',
      },
    ],
    social_media_url: [
      {
        title: 'Address Web Browsing Habits',
        description: 'Excessive time on social media websites impacts work output.',
        action: 'Discuss time management strategies and work expectations.',
        priority: 'medium',
      },
      {
        title: 'Implement Web Filtering',
        description: 'Consider website restrictions for chronic issues.',
        action: 'Review web filtering options and communicate policy changes.',
        priority: 'high',
      },
    ],
    entertainment: [
      {
        title: 'Discuss Work-Life Balance',
        description: 'Entertainment site usage during work may indicate burnout or boredom.',
        action: 'Check if the employee needs more challenging work or a break.',
        priority: 'low',
      },
      {
        title: 'Reinforce Expectations',
        description: 'Streaming services during work hours significantly impacts productivity.',
        action: 'Have a direct conversation about work expectations.',
        priority: 'medium',
      },
    ],
    gaming: [
      {
        title: 'Immediate Intervention Required',
        description: 'Gaming during work hours is a serious policy violation.',
        action: 'Schedule an immediate meeting to address this behavior.',
        priority: 'high',
      },
      {
        title: 'Document and Escalate',
        description: 'Repeated gaming incidents may require formal action.',
        action: 'Document the issue and consider HR involvement.',
        priority: 'high',
      },
    ],
    excessive_idle: [
      {
        title: 'Verify Work Assignment',
        description: 'High idle time may indicate insufficient workload.',
        action: 'Review current task assignments and project participation.',
        priority: 'medium',
      },
      {
        title: 'Check for Meeting Overload',
        description: 'Idle periods might coincide with excessive meetings.',
        action: 'Review meeting schedules and ensure productive work time.',
        priority: 'low',
      },
    ],
  };

  // Select recommendation based on severity and count
  const typeRecs = recommendations[type];
  let selectedRec: Recommendation;

  if (severity === 'critical' || severity === 'high' || count >= 10) {
    selectedRec = typeRecs[typeRecs.length - 1]; // More serious recommendation
  } else {
    selectedRec = typeRecs[0]; // Standard recommendation
  }

  // Adjust priority based on severity
  if (severity === 'critical') {
    selectedRec = { ...selectedRec, priority: 'high' };
  } else if (severity === 'low') {
    selectedRec = { ...selectedRec, priority: 'low' };
  }

  return selectedRec;
}

/**
 * Get a short AI recommendation text for display
 */
export function getShortRecommendation(issue: DetectedIssue): string {
  const rec = getRecommendation(issue);
  return rec.action;
}

/**
 * Get severity-based action urgency
 */
export function getActionUrgency(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical':
      return 'Immediate action required';
    case 'high':
      return 'Action needed within 24 hours';
    case 'medium':
      return 'Address within this week';
    case 'low':
      return 'Monitor and review';
  }
}

/**
 * Generate an executive summary for a set of issues
 */
export function generateExecutiveSummary(
  totalIssues: number,
  employeesAffected: number,
  avgRiskScore: number,
  topIssueType: string | null
): string {
  if (totalIssues === 0) {
    return 'Excellent! No productivity issues detected during this period. All employees are maintaining good work patterns.';
  }

  const riskLevel = avgRiskScore >= 70 ? 'high' : avgRiskScore >= 40 ? 'moderate' : 'low';
  const urgency = avgRiskScore >= 70 ? 'Immediate attention required.' : avgRiskScore >= 40 ? 'Review recommended.' : 'Continue monitoring.';

  let summary = `Detected ${totalIssues} issue${totalIssues > 1 ? 's' : ''} affecting ${employeesAffected} employee${employeesAffected > 1 ? 's' : ''} with a ${riskLevel} average risk score of ${avgRiskScore}. `;
  
  if (topIssueType) {
    summary += `The most common concern is ${topIssueType}. `;
  }
  
  summary += urgency;

  return summary;
}

