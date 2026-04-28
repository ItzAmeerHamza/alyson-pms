// Utility functions for URL Activity module
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  SOCIAL_MEDIA_DOMAINS,
  WORK_DOMAINS,
  ENTERTAINMENT_DOMAINS,
  NEWS_DOMAINS,
  SHOPPING_DOMAINS,
  SEARCH_DOMAINS,
  COMMUNICATION_DOMAINS,
  TIME_OF_DAY_RANGES,
} from './constants';
import { CategoryType, TimeOfDay, URLLog } from './types';

/**
 * Calculate date range based on preset
 */
export const calculatePresetDateRange = (preset: string): { from: Date; to: Date } => {
  const now = new Date();
  
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':
      return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case 'last7days':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case 'last30days':
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'thisWeek':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfDay(now) };
    case 'lastWeek':
      const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      return { from: lastWeekStart, to: lastWeekEnd };
    case 'lastMonth':
      const lastMonthDate = subDays(startOfMonth(now), 1);
      return { from: startOfMonth(lastMonthDate), to: endOfMonth(lastMonthDate) };
    default:
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
  }
};

/**
 * Extract domain from URL
 */
export const extractDomain = (url: string): string => {
  try {
    if (!url) return 'Unknown';
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch {
    return url || 'Unknown';
  }
};

/**
 * @deprecated REMOVED - AI Vision now classifies dynamically
 * Check if domain is social media - ALWAYS returns false
 * Use vision_category from screenshots table instead
 */
export const isSocialMedia = (domain: string): boolean => {
  // REMOVED: Static domain matching caused false positives
  // AI now analyzes actual screenshot content to decide
  return false;
};

/**
 * Categorize domain into category type
 * 
 * NOTE: This is FALLBACK categorization for URL display purposes only.
 * For accurate activity classification, use vision_category from screenshots table.
 * AI Vision analyzes actual screenshot content and context to classify correctly.
 * 
 * Example: youtube.com could be:
 * - "productive" if watching coding tutorial (AI sees tutorial content)
 * - "entertainment" if watching music videos (AI sees entertainment content)
 * 
 * Static domain matching CANNOT determine context - AI can.
 */
export const categorizeDomain = (domain: string): CategoryType => {
  if (!domain) return 'Other';
  
  const lowerDomain = domain.toLowerCase();
  
  // Basic categorization for display - NOT used for Activity Issues detection
  // Activity Issues now use vision_category from AI analysis
  
  // Check work/development domains (usually accurate)
  if (WORK_DOMAINS.some(wd => lowerDomain.includes(wd))) {
    return 'Work';
  }
  
  // Check search engines
  if (SEARCH_DOMAINS.some(se => lowerDomain.includes(se))) {
    return 'Search';
  }
  
  // Check communication (context-dependent - AI decides if work or personal)
  if (COMMUNICATION_DOMAINS.some(cd => lowerDomain.includes(cd))) {
    return 'Communication';
  }
  
  // Check news
  if (NEWS_DOMAINS.some(nd => lowerDomain.includes(nd))) {
    return 'News';
  }
  
  // Check shopping
  if (SHOPPING_DOMAINS.some(sd => lowerDomain.includes(sd))) {
    return 'Shopping';
  }
  
  // Check social media domains
  if (SOCIAL_MEDIA_DOMAINS.some(sm => lowerDomain.includes(sm))) {
    return 'Social Media';
  }
  
  // Check entertainment domains
  if (ENTERTAINMENT_DOMAINS.some(ed => lowerDomain.includes(ed))) {
    return 'Entertainment';
  }
  
  // Check for common development patterns
  if (lowerDomain.includes('dev') || 
      lowerDomain.includes('api') || 
      lowerDomain.includes('docs') ||
      lowerDomain.includes('documentation')) {
    return 'Development';
  }
  
  // Check for productivity tools
  if (lowerDomain.includes('productivity') || 
      lowerDomain.includes('task') || 
      lowerDomain.includes('project')) {
    return 'Productivity';
  }
  
  return 'Other';
};

/**
 * Calculate productivity score based on categories
 * Work/Development/Productivity = high score
 * Social Media/Entertainment = low score
 */
export const calculateProductivityScore = (urls: URLLog[]): number => {
  if (!urls || urls.length === 0) return 0;
  
  let workPoints = 0;
  let totalPoints = 0;
  
  urls.forEach(url => {
    const domain = extractDomain(url.url || url.site_url || '');
    const category = categorizeDomain(domain);
    
    switch (category) {
      case 'Work':
      case 'Development':
      case 'Productivity':
        workPoints += 10;
        totalPoints += 10;
        break;
      case 'Communication':
      case 'Search':
        workPoints += 7;
        totalPoints += 10;
        break;
      case 'News':
        workPoints += 3;
        totalPoints += 10;
        break;
      case 'Social Media':
      case 'Entertainment':
        workPoints += 0;
        totalPoints += 10;
        break;
      default:
        workPoints += 5;
        totalPoints += 10;
    }
  });
  
  return totalPoints > 0 ? Math.round((workPoints / totalPoints) * 100) : 0;
};

/**
 * Format duration in human-readable format
 */
export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

/**
 * Get time of day from hour (0-23)
 */
export const getTimeOfDay = (hour: number): TimeOfDay => {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'night';
};

/**
 * Check if time falls within time of day filter
 */
export const matchesTimeOfDay = (timestamp: string, filter: TimeOfDay): boolean => {
  if (filter === 'all') return true;
  
  const date = new Date(timestamp);
  const hour = date.getHours();
  const range = TIME_OF_DAY_RANGES[filter];
  
  if (filter === 'night') {
    // Night spans across midnight (0-6)
    return hour >= range.start || hour < range.end;
  }
  
  return hour >= range.start && hour < range.end;
};

/**
 * Generate session ID from time_log_id or timestamp + user_id
 */
export const generateSessionId = (url: URLLog, timeSlot?: string): string => {
  if (url.time_log_id) {
    return url.time_log_id;
  }
  
  // Generate ID from user + time slot
  const timestamp = url.started_at || url.timestamp;
  const date = new Date(timestamp);
  const slot = timeSlot || format(date, 'HH:mm');
  return `${url.user_id}-${slot}`;
};

/**
 * Round time to 30-minute intervals
 */
export const roundTo30Minutes = (date: Date): Date => {
  const minutes = date.getMinutes();
  const roundedMinutes = minutes < 30 ? 0 : 30;
  const rounded = new Date(date);
  rounded.setMinutes(roundedMinutes, 0, 0);
  return rounded;
};

/**
 * Get time slot string for a date (e.g., "14:00 - 14:30")
 */
export const getTimeSlot = (date: Date): string => {
  const start = roundTo30Minutes(date);
  const end = new Date(start);
  end.setMinutes(start.getMinutes() + 30);
  
  return `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`;
};

/**
 * Get productivity level label from score
 */
export const getProductivityLevel = (score: number): { label: string; color: string } => {
  if (score >= 80) return { label: 'Excellent', color: 'text-green-600' };
  if (score >= 60) return { label: 'Good', color: 'text-blue-600' };
  if (score >= 40) return { label: 'Fair', color: 'text-yellow-600' };
  if (score >= 20) return { label: 'Poor', color: 'text-orange-600' };
  return { label: 'Very Poor', color: 'text-red-600' };
};

/**
 * Safely format dates
 */
export const safeFormat = (dateValue: string | null | undefined, formatString: string): string => {
  if (!dateValue) return 'Invalid date';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return 'Invalid date';
    return format(date, formatString);
  } catch (error) {
    console.error('Date formatting error:', error, 'Value:', dateValue);
    return 'Invalid date';
  }
};

/**
 * Group consecutive numbers into ranges (for heatmap)
 */
export const groupIntoRanges = (numbers: number[]): string[] => {
  if (numbers.length === 0) return [];
  
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges;
};

