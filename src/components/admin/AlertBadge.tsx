/**
 * AlertBadge Component
 * 
 * Small visual indicators for screenshots and user cards showing:
 * - Alert severity
 * - Activity category (gaming, social, etc.)
 * - Duplicate indicator
 * - Idle status
 */

import React from 'react';
import { 
  AlertTriangle, 
  Gamepad2, 
  Smartphone, 
  Tv, 
  ShoppingCart, 
  Copy, 
  Moon,
  Shield,
  Clock
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AlertBadgeProps {
  type: 'severity' | 'category' | 'duplicate' | 'idle' | 'privacy';
  value: string | number;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

// Severity badge configurations
const severityConfig: Record<string, { bg: string; icon: React.ElementType; label: string }> = {
  critical: { bg: 'bg-red-600', icon: AlertTriangle, label: 'Critical Alert' },
  high: { bg: 'bg-orange-500', icon: AlertTriangle, label: 'High Alert' },
  medium: { bg: 'bg-yellow-500', icon: AlertTriangle, label: 'Medium Alert' },
  low: { bg: 'bg-blue-500', icon: AlertTriangle, label: 'Low Alert' },
};

// Category badge configurations
const categoryConfig: Record<string, { bg: string; icon: React.ElementType; label: string }> = {
  gaming: { bg: 'bg-purple-600', icon: Gamepad2, label: 'Gaming' },
  social_media: { bg: 'bg-blue-500', icon: Smartphone, label: 'Social Media' },
  entertainment: { bg: 'bg-orange-500', icon: Tv, label: 'Entertainment' },
  shopping: { bg: 'bg-pink-500', icon: ShoppingCart, label: 'Shopping' },
};

// Size configurations
const sizeConfig = {
  sm: { badge: 'w-5 h-5', icon: 'h-3 w-3', text: 'text-[10px]' },
  md: { badge: 'w-6 h-6', icon: 'h-4 w-4', text: 'text-xs' },
  lg: { badge: 'w-8 h-8', icon: 'h-5 w-5', text: 'text-sm' },
};

export function AlertBadge({ 
  type, 
  value, 
  size = 'md', 
  showTooltip = true,
  className = '' 
}: AlertBadgeProps) {
  const sizes = sizeConfig[size];
  
  let config: { bg: string; icon: React.ElementType; label: string } | null = null;
  let content: React.ReactNode = null;

  switch (type) {
    case 'severity':
      config = severityConfig[value as string];
      if (!config) return null;
      break;
    
    case 'category':
      config = categoryConfig[value as string];
      if (!config) return null;
      break;
    
    case 'duplicate':
      const count = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (!count || count < 2) return null;
      config = { bg: 'bg-gray-500', icon: Copy, label: `${count} duplicates` };
      content = count > 99 ? '99+' : count.toString();
      break;
    
    case 'idle':
      if (!value) return null;
      config = { bg: 'bg-gray-400', icon: Moon, label: 'Idle' };
      break;
    
    case 'privacy':
      if (!value) return null;
      config = { bg: 'bg-red-700', icon: Shield, label: 'Privacy Concern' };
      break;
    
    default:
      return null;
  }

  if (!config) return null;

  const Icon = config.icon;

  const badge = (
    <div 
      className={`
        ${sizes.badge} ${config.bg} 
        rounded-full flex items-center justify-center 
        text-white shadow-sm
        ${className}
      `}
    >
      {content ? (
        <span className={sizes.text}>{content}</span>
      ) : (
        <Icon className={sizes.icon} />
      )}
    </div>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Composite badge showing all relevant badges for a screenshot
 */
interface ScreenshotBadgesProps {
  category?: string;
  alertSeverity?: string;
  duplicateCount?: number;
  isIdle?: boolean;
  hasPrivacyConcern?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ScreenshotBadges({
  category,
  alertSeverity,
  duplicateCount,
  isIdle,
  hasPrivacyConcern,
  size = 'sm',
  className = ''
}: ScreenshotBadgesProps) {
  const badges: React.ReactNode[] = [];

  // Priority order: severity > privacy > category > duplicate > idle
  if (alertSeverity) {
    badges.push(
      <AlertBadge key="severity" type="severity" value={alertSeverity} size={size} />
    );
  }

  if (hasPrivacyConcern) {
    badges.push(
      <AlertBadge key="privacy" type="privacy" value="true" size={size} />
    );
  }

  if (category && ['gaming', 'social_media', 'entertainment', 'shopping'].includes(category)) {
    badges.push(
      <AlertBadge key="category" type="category" value={category} size={size} />
    );
  }

  if (duplicateCount && duplicateCount >= 2) {
    badges.push(
      <AlertBadge key="duplicate" type="duplicate" value={duplicateCount} size={size} />
    );
  }

  if (isIdle) {
    badges.push(
      <AlertBadge key="idle" type="idle" value="true" size={size} />
    );
  }

  if (badges.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {badges}
    </div>
  );
}

/**
 * Alert count indicator for headers/navigation
 */
interface AlertCountIndicatorProps {
  count: number;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export function AlertCountIndicator({ count, severity = 'high' }: AlertCountIndicatorProps) {
  if (count === 0) return null;

  const colors = {
    critical: 'bg-red-600 animate-pulse',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
  };

  return (
    <span 
      className={`
        ${colors[severity]}
        text-white text-xs font-bold
        min-w-[20px] h-5 px-1.5
        rounded-full flex items-center justify-center
      `}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default AlertBadge;



