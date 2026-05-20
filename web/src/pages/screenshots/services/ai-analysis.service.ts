import { Screenshot, AnalysisResult } from '../types';
import { AI_CONTENT_PATTERNS } from '../constants';

// Map database category names to display categories
export const mapDbCategoryToDisplayCategory = (dbCategory: string): Screenshot['content_category'] => {
  const categoryMap: Record<string, Screenshot['content_category']> = {
    // Handle both database lowercase and any title case variations
    'social_media': 'social_media',
    'gaming': 'gaming', 
    'entertainment': 'entertainment',
    'productive': 'productive',
    'news': 'news',
    'shopping': 'shopping',
    // Legacy title case support
    'Social Media': 'social_media',
    'Gaming': 'gaming', 
    'Entertainment': 'entertainment',
    'Productive': 'productive',
    'News': 'news',
    'Shopping': 'shopping'
  };
  
  return categoryMap[dbCategory] || 'productive';
};

// AI Content Analysis Function
export const analyzeScreenshotContent = (screenshot: Screenshot): AnalysisResult => {
  const url = (screenshot.url || '').toLowerCase();
  const windowTitle = (screenshot.window_title || screenshot.active_window_title || '').toLowerCase();
  const appName = (screenshot.app_name || '').toLowerCase();
  
  const allText = `${url} ${windowTitle} ${appName}`;
  const tags: string[] = [];
  const reasoning: string[] = [];
  let maxScore = 0;
  let detectedCategory = 'productive';

  // Debug information for troubleshooting
  console.log('🔍 AI Analysis Debug:', {
    url: screenshot.url,
    windowTitle: screenshot.window_title,
    appName: screenshot.app_name,
    allText: allText,
    screenshotId: screenshot.id
  });

  // Analyze against each pattern category
  Object.entries(AI_CONTENT_PATTERNS).forEach(([categoryName, patterns]) => {
    let categoryMatches = 0;
    
    // Check domains
    patterns.domains.forEach(domain => {
      if (allText.includes(domain)) {
        categoryMatches++;
        tags.push(`${categoryName}_domain`);
        reasoning.push(`Detected ${categoryName} domain: ${domain}`);
        console.log(`✅ Domain match: ${domain} in category ${categoryName}`);
      }
    });
    
    // Check apps
    patterns.apps.forEach(app => {
      if (allText.includes(app)) {
        categoryMatches++;
        tags.push(`${categoryName}_app`);
        reasoning.push(`Detected ${categoryName} app: ${app}`);
        console.log(`✅ App match: ${app} in category ${categoryName}`);
      }
    });
    
    // Check keywords
    patterns.keywords.forEach(keyword => {
      if (allText.includes(keyword)) {
        categoryMatches++;
        tags.push(`${categoryName}_keyword`);
        reasoning.push(`Detected ${categoryName} keyword: ${keyword}`);
        console.log(`✅ Keyword match: ${keyword} in category ${categoryName}`);
      }
    });
    
    // If we have matches in this category and it has a higher score, update
    if (categoryMatches > 0 && patterns.score > maxScore) {
      maxScore = patterns.score;
      detectedCategory = categoryName;
      console.log(`🎯 Category updated: ${categoryName} with score ${patterns.score}`);
    }
  });

  // Additional AI-like pattern detection
  const activityLevel = screenshot.activity_percent || 0;
  const focusLevel = screenshot.focus_percent || 0;
  
  // Low activity combined with entertainment content = high distraction
  if (activityLevel < 30 && (detectedCategory === 'entertainment' || detectedCategory === 'gaming')) {
    maxScore += 20;
    tags.push('low_activity_entertainment');
    reasoning.push('Low activity detected with entertainment content');
  }
  
  // High focus on social media during work hours = distraction
  if (focusLevel > 70 && detectedCategory === 'social_media') {
    maxScore += 15;
    tags.push('high_focus_social');
    reasoning.push('High focus on social media content');
  }
  
  // Multiple entertainment indicators
  if (tags.filter(tag => tag.includes('entertainment') || tag.includes('gaming') || tag.includes('social')).length > 2) {
    maxScore += 10;
    tags.push('multiple_distraction_indicators');
    reasoning.push('Multiple distraction indicators detected');
  }

  // ✅ FIXED: Lower threshold and ensure any detected category is used
  const finalCategory = maxScore > 0 ? detectedCategory : 'productive';
  const finalScore = Math.max(maxScore, maxScore > 0 ? 10 : 0); // Minimum 10 if any category detected

  console.log('🎯 Final AI Analysis:', {
    detectedCategory: finalCategory,
    originalScore: maxScore,
    finalScore: finalScore,
    matches: tags.length,
    reasoning: reasoning
  });

  return {
    category: finalCategory,
    tags: [...new Set(tags)], // Remove duplicates
    distractionScore: Math.min(100, finalScore),
    reasoning
  };
}; 