/**
 * Alert Engine for TimeFlow AI Analysis
 * 
 * Centralized alert creation and management for:
 * - Non-work activity detection
 * - Duplicate/idle detection
 * - Suspicious activity
 * - Privacy concerns
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

// Alert types
export type AlertType = 
  | 'non_work_activity'
  | 'extended_idle'
  | 'consecutive_duplicates'
  | 'potential_fraud'
  | 'privacy_concern'
  | 'unusual_hours'
  | 'productivity_drop'
  | 'suspicious_pattern';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ContentCategory = 
  | 'productive'
  | 'social_media'
  | 'entertainment'
  | 'gaming'
  | 'shopping'
  | 'communication'
  | 'other';

export interface AlertData {
  user_id: string;
  screenshot_id?: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  category?: ContentCategory;
  title: string;
  message: string;
  ai_confidence?: number;
  ai_reasoning?: string;
  vision_analysis?: Record<string, any>;
  metadata?: Record<string, any>;
  organization_id?: string;
}

export interface Alert extends AlertData {
  id: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  is_false_positive: boolean;
  created_at: string;
}

// Severity thresholds for different alert types
const SEVERITY_RULES: Record<AlertType, {
  default: AlertSeverity;
  conditions?: Array<{ check: (data: any) => boolean; severity: AlertSeverity }>;
}> = {
  non_work_activity: {
    default: 'medium',
    conditions: [
      { check: (d) => d.category === 'gaming', severity: 'high' },
      { check: (d) => d.category === 'adult', severity: 'critical' },
      { check: (d) => d.ai_confidence && d.ai_confidence > 0.9, severity: 'high' },
    ],
  },
  extended_idle: {
    default: 'low',
    conditions: [
      { check: (d) => d.metadata?.consecutive_count >= 20, severity: 'high' },
      { check: (d) => d.metadata?.consecutive_count >= 10, severity: 'medium' },
    ],
  },
  consecutive_duplicates: {
    default: 'low',
    conditions: [
      { check: (d) => d.metadata?.consecutive_count >= 30, severity: 'critical' },
      { check: (d) => d.metadata?.consecutive_count >= 20, severity: 'high' },
      { check: (d) => d.metadata?.consecutive_count >= 10, severity: 'medium' },
    ],
  },
  potential_fraud: {
    default: 'high',
    conditions: [
      { check: (d) => d.metadata?.risk_score >= 80, severity: 'critical' },
    ],
  },
  privacy_concern: {
    default: 'high',
    conditions: [
      { check: (d) => d.metadata?.privacy_concerns?.includes('Financial'), severity: 'critical' },
    ],
  },
  unusual_hours: {
    default: 'low',
  },
  productivity_drop: {
    default: 'medium',
    conditions: [
      { check: (d) => d.metadata?.drop_percentage >= 50, severity: 'high' },
    ],
  },
  suspicious_pattern: {
    default: 'medium',
    conditions: [
      { check: (d) => d.metadata?.pattern_type === 'automation', severity: 'high' },
    ],
  },
};

/**
 * Calculate severity based on alert type and data
 */
function calculateSeverity(alertType: AlertType, data: Partial<AlertData>): AlertSeverity {
  const rules = SEVERITY_RULES[alertType];
  
  if (rules.conditions) {
    for (const condition of rules.conditions) {
      if (condition.check(data)) {
        return condition.severity;
      }
    }
  }
  
  return rules.default;
}

/**
 * Get Supabase client
 */
function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

/**
 * Create a new alert
 */
export async function createAlert(data: AlertData): Promise<{ success: boolean; alert?: Alert; error?: string }> {
  try {
    const supabase = getSupabaseClient();
    
    // Calculate severity if not provided
    const severity = data.severity || calculateSeverity(data.alert_type, data);
    
    // Resolve organization_id if not provided
    let orgId = data.organization_id;
    if (!orgId) {
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', data.user_id)
        .single();
      orgId = userData?.organization_id || null;
    }

    const alertRecord = {
      user_id: data.user_id,
      screenshot_id: data.screenshot_id || null,
      alert_type: data.alert_type,
      severity,
      category: data.category || null,
      title: data.title,
      message: data.message,
      ai_confidence: data.ai_confidence || null,
      ai_reasoning: data.ai_reasoning || null,
      vision_analysis: data.vision_analysis || null,
      metadata: data.metadata || {},
      acknowledged: false,
      is_false_positive: false,
      organization_id: orgId,
    };
    
    const { data: alert, error } = await supabase
      .from('admin_alerts')
      .insert(alertRecord)
      .select()
      .single();
    
    if (error) {
      console.error('Failed to create alert:', error);
      return { success: false, error: error.message };
    }
    
    console.log(`🚨 Alert created: [${severity.toUpperCase()}] ${data.alert_type} for user ${data.user_id}`);
    
    return { success: true, alert };
  } catch (error: any) {
    console.error('Error creating alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create alert for non-work activity detected
 */
export async function createNonWorkAlert(
  userId: string,
  screenshotId: string,
  analysis: {
    category: ContentCategory;
    detected_content: string;
    confidence: number;
    reasoning?: string;
  }
): Promise<{ success: boolean; alert?: Alert; error?: string }> {
  const categoryLabels: Record<ContentCategory, string> = {
    productive: 'Productive',
    social_media: 'Social Media',
    entertainment: 'Entertainment',
    gaming: 'Gaming',
    shopping: 'Shopping',
    communication: 'Communication',
    other: 'Other',
  };
  
  return createAlert({
    user_id: userId,
    screenshot_id: screenshotId,
    alert_type: 'non_work_activity',
    severity: analysis.category === 'gaming' ? 'high' : 'medium',
    category: analysis.category,
    title: `${categoryLabels[analysis.category]} Activity Detected`,
    message: analysis.detected_content,
    ai_confidence: analysis.confidence,
    ai_reasoning: analysis.reasoning,
  });
}

/**
 * Create alert for consecutive duplicate screenshots
 */
export async function createDuplicateAlert(
  userId: string,
  screenshotId: string,
  consecutiveCount: number,
  durationMinutes: number
): Promise<{ success: boolean; alert?: Alert; error?: string }> {
  let severity: AlertSeverity = 'low';
  let title = 'Duplicate Screenshots Detected';
  
  if (consecutiveCount >= 30) {
    severity = 'critical';
    title = 'Extended Inactivity Detected';
  } else if (consecutiveCount >= 20) {
    severity = 'high';
    title = 'Prolonged Duplicate Screenshots';
  } else if (consecutiveCount >= 10) {
    severity = 'medium';
    title = 'Multiple Duplicate Screenshots';
  }
  
  return createAlert({
    user_id: userId,
    screenshot_id: screenshotId,
    alert_type: 'consecutive_duplicates',
    severity,
    title,
    message: `${consecutiveCount} consecutive identical screenshots over ${durationMinutes} minutes. User may be idle or away.`,
    metadata: {
      consecutive_count: consecutiveCount,
      duration_minutes: durationMinutes,
    },
  });
}

/**
 * Create alert for privacy concerns
 */
export async function createPrivacyAlert(
  userId: string,
  screenshotId: string,
  concerns: string[]
): Promise<{ success: boolean; alert?: Alert; error?: string }> {
  const hasFinancial = concerns.some(c => c.toLowerCase().includes('financial') || c.toLowerCase().includes('bank'));
  
  return createAlert({
    user_id: userId,
    screenshot_id: screenshotId,
    alert_type: 'privacy_concern',
    severity: hasFinancial ? 'critical' : 'high',
    title: 'Privacy Sensitive Content Detected',
    message: `Screenshot may contain sensitive information: ${concerns.join(', ')}`,
    metadata: {
      privacy_concerns: concerns,
    },
  });
}

/**
 * Create alert for unusual hours activity
 */
export async function createUnusualHoursAlert(
  userId: string,
  screenshotId: string,
  activityTime: string,
  typicalHours: { start: number; end: number }
): Promise<{ success: boolean; alert?: Alert; error?: string }> {
  return createAlert({
    user_id: userId,
    screenshot_id: screenshotId,
    alert_type: 'unusual_hours',
    severity: 'low',
    title: 'Activity Outside Normal Hours',
    message: `Activity detected at ${activityTime}, outside typical hours (${typicalHours.start}:00 - ${typicalHours.end}:00)`,
    metadata: {
      activity_time: activityTime,
      typical_hours: typicalHours,
    },
  });
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string,
  isFalsePositive = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('admin_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date().toISOString(),
        is_false_positive: isFalsePositive,
      })
      .eq('id', alertId);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get unacknowledged alerts count by severity
 */
export async function getAlertCounts(userId?: string, organizationId?: string): Promise<{
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}> {
  try {
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from('admin_alerts')
      .select('severity', { count: 'exact' })
      .eq('acknowledged', false);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error getting alert counts:', error);
      return { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
    }
    
    const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
    
    data?.forEach((row: any) => {
      counts[row.severity as keyof typeof counts]++;
      counts.total++;
    });
    
    return counts;
  } catch (error) {
    console.error('Error getting alert counts:', error);
    return { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  }
}

/**
 * Check if we should create an alert (avoid duplicates)
 */
export async function shouldCreateAlert(
  userId: string,
  alertType: AlertType,
  cooldownMinutes = 30
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    
    const cooldownTime = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('admin_alerts')
      .select('id')
      .eq('user_id', userId)
      .eq('alert_type', alertType)
      .gte('created_at', cooldownTime)
      .limit(1);
    
    if (error) {
      console.error('Error checking alert cooldown:', error);
      return true; // Allow alert if check fails
    }
    
    return !data || data.length === 0;
  } catch (error) {
    console.error('Error checking alert cooldown:', error);
    return true;
  }
}



