// Session grouping utilities
import { format } from 'date-fns';
import { URLLog, URLSession, CategoryCount } from '../types';
import { extractDomain, categorizeDomain, isSocialMedia, getTimeSlot, calculateProductivityScore } from '../utils';

/**
 * Group URLs into sessions by time_log_id or 30-minute time windows
 */
export const groupUrlsIntoSessions = (urls: URLLog[], users: { id: string; full_name: string }[]): URLSession[] => {
  const sessionMap = new Map<string, URLSession>();
  
  urls.forEach(url => {
    const timestamp = url.started_at || url.timestamp;
    const date = new Date(timestamp);
    const timeSlot = getTimeSlot(date);
    
    // Generate session key: prefer time_log_id, fallback to user+timeSlot
    const sessionKey = url.time_log_id || `${url.user_id}-${timeSlot}`;
    
    if (!sessionMap.has(sessionKey)) {
      const user = users.find(u => u.id === url.user_id);
      const userName = user?.full_name || url.users?.full_name || 'Unknown User';
      
      sessionMap.set(sessionKey, {
        sessionId: sessionKey,
        timeSlot,
        userId: url.user_id,
        userName,
        urls: [],
        totalDuration: 0,
        uniqueDomains: 0,
        categoryBreakdown: [],
        hasSocialMedia: false,
        socialMediaUrls: [],
        startTime: date,
        endTime: date,
        productivityScore: 0,
      });
    }
    
    const session = sessionMap.get(sessionKey)!;
    session.urls.push(url);
    
    // Update time range
    if (date < session.startTime) session.startTime = date;
    if (date > session.endTime) session.endTime = date;
    
    // Check for social media
    const domain = extractDomain(url.url || url.site_url || '');
    if (isSocialMedia(domain)) {
      session.hasSocialMedia = true;
      session.socialMediaUrls.push(url);
    }
  });
  
  // Calculate session metrics
  sessionMap.forEach(session => {
    // Estimate duration (1 minute per URL visit)
    session.totalDuration = session.urls.length * 60;
    
    // Count unique domains
    const domains = new Set(
      session.urls.map(url => extractDomain(url.url || url.site_url || ''))
    );
    session.uniqueDomains = domains.size;
    
    // Calculate category breakdown
    const categoryMap = new Map<string, CategoryCount>();
    session.urls.forEach(url => {
      const domain = extractDomain(url.url || url.site_url || '');
      const category = categorizeDomain(domain);
      
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { category, count: 0, duration: 0 });
      }
      
      const catData = categoryMap.get(category)!;
      catData.count++;
      catData.duration += 60; // Estimate 1 minute per visit
    });
    
    session.categoryBreakdown = Array.from(categoryMap.values())
      .sort((a, b) => b.count - a.count);
    
    // Calculate productivity score
    session.productivityScore = calculateProductivityScore(session.urls);
  });
  
  // Convert to array and sort by start time (descending)
  return Array.from(sessionMap.values())
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
};

/**
 * Filter sessions based on criteria
 */
export const filterSessions = (
  sessions: URLSession[],
  filters: {
    searchTerm?: string;
    categoryFilter?: string;
    timeOfDayFilter?: string;
    socialMediaOnly?: boolean;
  }
): URLSession[] => {
  return sessions.filter(session => {
    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const matchesSearch = 
        session.userName.toLowerCase().includes(searchLower) ||
        session.urls.some(url => {
          const domain = extractDomain(url.url || url.site_url || '');
          const title = url.title || '';
          return domain.toLowerCase().includes(searchLower) ||
                 title.toLowerCase().includes(searchLower);
        });
      
      if (!matchesSearch) return false;
    }
    
    // Category filter
    if (filters.categoryFilter && filters.categoryFilter !== 'all') {
      const hasCategory = session.categoryBreakdown.some(
        cat => cat.category === filters.categoryFilter
      );
      if (!hasCategory) return false;
    }
    
    // Social media only filter
    if (filters.socialMediaOnly && !session.hasSocialMedia) {
      return false;
    }
    
    // Time of day filter
    if (filters.timeOfDayFilter && filters.timeOfDayFilter !== 'all') {
      const hour = session.startTime.getHours();
      switch (filters.timeOfDayFilter) {
        case 'morning':
          if (hour < 6 || hour >= 12) return false;
          break;
        case 'afternoon':
          if (hour < 12 || hour >= 18) return false;
          break;
        case 'evening':
          if (hour < 18 || hour >= 24) return false;
          break;
        case 'night':
          if (hour >= 6 && hour < 24) return false;
          break;
      }
    }
    
    return true;
  });
};

/**
 * Get sessions for a specific user
 */
export const getSessionsByUser = (sessions: URLSession[], userId: string): URLSession[] => {
  return sessions.filter(session => session.userId === userId);
};

/**
 * Get session statistics
 */
export const getSessionStatistics = (sessions: URLSession[]) => {
  const totalSessions = sessions.length;
  const avgDuration = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + s.totalDuration, 0) / sessions.length
    : 0;
  const avgProductivity = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + s.productivityScore, 0) / sessions.length
    : 0;
  const sessionsWithSocialMedia = sessions.filter(s => s.hasSocialMedia).length;
  const socialMediaPercentage = totalSessions > 0
    ? (sessionsWithSocialMedia / totalSessions) * 100
    : 0;
  
  return {
    totalSessions,
    avgDuration,
    avgProductivity,
    sessionsWithSocialMedia,
    socialMediaPercentage,
  };
};

