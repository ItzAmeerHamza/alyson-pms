/**
 * URL Extraction from Window Titles
 * Fallback method for platforms without direct URL access
 */

/**
 * Extract URL from window title using common patterns
 */
export function extractUrlFromTitle(title: string): string | null {
  if (!title) return null;
  
  // Direct URL match - some browsers show the full URL in title
  const urlMatch = title.match(/\bhttps?:\/\/[^\s]+/i);
  if (urlMatch) {
    // Clean up common trailing characters
    return urlMatch[0].replace(/[,;)\]]+$/, '');
  }
  
  // Common browser title patterns:
  // "Page Title - domain.com"
  // "Page Title • domain.com"
  // "Page Title | domain.com"
  // "domain.com - Page Title"
  
  // Try to extract domain from common separators
  const separators = [' - ', ' • ', ' | ', ' — ', ' – '];
  
  for (const sep of separators) {
    const parts = title.split(sep);
    
    // Check each part for a domain-like pattern
    for (const part of parts) {
      const trimmed = part.trim();
      
      // Match domain pattern: word.word or word.word.word etc
      const domainMatch = trimmed.match(/^([a-z0-9-]+\.)+[a-z]{2,}$/i);
      if (domainMatch) {
        return `https://${domainMatch[0]}`;
      }
      
      // Match domain with path: domain.com/path
      const domainPathMatch = trimmed.match(/^(([a-z0-9-]+\.)+[a-z]{2,})(\/[^\s]*)?$/i);
      if (domainPathMatch) {
        return `https://${domainPathMatch[0]}`;
      }
    }
  }
  
  // Try to find any domain-like pattern in the title
  const anyDomainMatch = title.match(/\b(([a-z0-9-]+\.)+[a-z]{2,})\b/i);
  if (anyDomainMatch) {
    // Make sure it's not a file extension or email
    const domain = anyDomainMatch[1];
    if (!domain.match(/\.(jpg|png|gif|pdf|doc|txt|js|css|html?)$/i) &&
        !title.match(new RegExp(`\\w+@${domain.replace(/\./g, '\\.')}`))) {
      return `https://${domain}`;
    }
  }
  
  return null;
}

/**
 * Check if a title indicates a special/internal page
 */
export function isSpecialPageTitle(title: string): boolean {
  if (!title) return true;
  
  const lowered = title.toLowerCase();
  
  // Common special page indicators
  const specialIndicators = [
    'new tab',
    'blank page',
    'untitled',
    'about:',
    'chrome://',
    'edge://',
    'firefox:',
    'settings',
    'preferences',
    'extensions',
    'downloads',
    'history',
    'bookmarks'
  ];
  
  return specialIndicators.some(indicator => lowered.includes(indicator));
}

/**
 * Enhanced title parsing with browser-specific patterns
 */
export function extractUrlFromTitleWithBrowser(title: string, browserSource: string): string | null {
  if (!title) return null;
  
  // Check for special pages first
  if (isSpecialPageTitle(title)) {
    return null;
  }
  
  // Try generic extraction first
  const genericUrl = extractUrlFromTitle(title);
  if (genericUrl) return genericUrl;
  
  // Browser-specific patterns
  switch (browserSource.toLowerCase()) {
    case 'firefox':
      // Firefox uses " — Mozilla Firefox" suffix
      const firefoxTitle = title.replace(/ — Mozilla Firefox$/, '');
      return extractUrlFromTitle(firefoxTitle);
      
    case 'safari':
      // Safari sometimes uses different separators
      const safariTitle = title.replace(/ — Private Browsing$/, '');
      return extractUrlFromTitle(safariTitle);
      
    case 'edge':
      // Edge uses " - Microsoft Edge" suffix
      const edgeTitle = title.replace(/ - Microsoft Edge$/, '');
      return extractUrlFromTitle(edgeTitle);
      
    default:
      return null;
  }
}

