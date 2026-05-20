/**
 * Title Normalizer
 * Stabilizes browser window titles by stripping counters/noise and trimming suffixes
 * Pre-compiled regexes for performance
 */

const BROWSER_NAMES = ['chrome', 'google chrome', 'firefox', 'safari', 'edge', 'microsoft edge', 'vscode', 'visual studio code', 'cursor'];

// Pre-compiled regexes for performance
const COUNTER_REGEX = /^\s*\([0-9]+\)\s*/g;
const BULLET_REGEX = /^\s*[•·]\s*/g;
const SPACES_REGEX = /\s{2,}/g;
const BROWSER_SUFFIX_REGEX = /\s+-\s+(google\s+chrome|microsoft\s+edge|safari|firefox|visual\s+studio\s+code|vscode|cursor)\s*$/i;

// Domain-specific normalization patterns
const DOMAIN_PATTERNS = [
  { pattern: /.*gmail\.com.*|.*mail\.google\.com.*/i, normalized: 'Gmail' },
  { pattern: /.*youtube\.com.*/i, normalized: 'YouTube' },
  { pattern: /.*github\.com.*/i, normalized: 'GitHub' },
  { pattern: /.*stackoverflow\.com.*/i, normalized: 'Stack Overflow' },
  { pattern: /.*chat\.openai\.com.*/i, normalized: 'ChatGPT' },
  { pattern: /.*claude\.ai.*/i, normalized: 'Claude' },
  { pattern: /.*linkedin\.com.*/i, normalized: 'LinkedIn' },
  { pattern: /.*twitter\.com.*|.*x\.com.*/i, normalized: 'X (Twitter)' },
  { pattern: /.*facebook\.com.*/i, normalized: 'Facebook' },
  { pattern: /.*instagram\.com.*/i, normalized: 'Instagram' },
  { pattern: /.*slack\.com.*/i, normalized: 'Slack' },
  { pattern: /.*notion\.so.*/i, normalized: 'Notion' },
  { pattern: /.*figma\.com.*/i, normalized: 'Figma' },
  { pattern: /.*docs\.google\.com.*/i, normalized: 'Google Docs' },
  { pattern: /.*sheets\.google\.com.*/i, normalized: 'Google Sheets' },
  { pattern: /.*drive\.google\.com.*/i, normalized: 'Google Drive' },
  { pattern: /.*calendar\.google\.com.*/i, normalized: 'Google Calendar' },
  { pattern: /.*meet\.google\.com.*/i, normalized: 'Google Meet' },
  { pattern: /.*zoom\.us.*/i, normalized: 'Zoom' },
  { pattern: /.*teams\.microsoft\.com.*/i, normalized: 'Microsoft Teams' },
  { pattern: /.*outlook\.office\.com.*|.*outlook\.live\.com.*/i, normalized: 'Outlook' },
  { pattern: /.*asana\.com.*/i, normalized: 'Asana' },
  { pattern: /.*monday\.com.*/i, normalized: 'Monday.com' },
  { pattern: /.*linear\.app.*/i, normalized: 'Linear' },
  { pattern: /.*atlassian\.com.*|.*jira\..*/i, normalized: 'Jira' },
  { pattern: /.*confluence\..*/i, normalized: 'Confluence' },
  { pattern: /.*salesforce\.com.*/i, normalized: 'Salesforce' },
  { pattern: /.*hubspot\.com.*/i, normalized: 'HubSpot' },
  { pattern: /.*worktime\.ebdaadt\.com.*|.*alyson-pms\.vercel\.app.*/i, normalized: 'Alyson PM' },
  { pattern: /.*reddit\.com.*/i, normalized: 'Reddit' },
  { pattern: /.*amazon\.com.*/i, normalized: 'Amazon' },
  { pattern: /.*netflix\.com.*/i, normalized: 'Netflix' },
  { pattern: /.*spotify\.com.*/i, normalized: 'Spotify' }
];

// Cache for normalized titles to avoid repeated work
const titleCache = new Map();
const CACHE_MAX_SIZE = 256;

function isBrowserApp(appName = '') {
  const n = String(appName).toLowerCase();
  return BROWSER_NAMES.some(b => n.includes(b));
}

function stripCounters(title = '') {
  let t = String(title);
  // Remove leading (n) counters and bullets using pre-compiled regexes
  t = t.replace(COUNTER_REGEX, '');
  t = t.replace(BULLET_REGEX, '');
  // Collapse spaces
  t = t.replace(SPACES_REGEX, ' ').trim();
  return t;
}

function applyDomainNormalization(title = '', appName = '') {
  // Only apply domain normalization to browsers
  if (!isBrowserApp(appName)) {
    return title;
  }
  
  // Check if title contains URL patterns
  const lowerTitle = title.toLowerCase();
  
  // Try domain-specific patterns
  for (const { pattern, normalized } of DOMAIN_PATTERNS) {
    if (pattern.test(lowerTitle)) {
      return normalized;
    }
  }
  
  // If no pattern matches, check for generic URL patterns
  // Extract domain from common patterns like "Page Title - domain.com"
  const urlMatch = title.match(/(?:^|\s)(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)/);
  if (urlMatch && urlMatch[1]) {
    // Return a cleaned domain name
    const domain = urlMatch[1];
    const parts = domain.split('.');
    if (parts.length >= 2) {
      // Get the main domain name (e.g., "example" from "example.com")
      const mainDomain = parts[parts.length - 2];
      // Capitalize first letter
      return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    }
  }
  
  return title;
}

function normalizeTitle(title = '', appName = '') {
  const cacheKey = `${title}|${appName}`;
  
  // Check cache first
  if (titleCache.has(cacheKey)) {
    return titleCache.get(cacheKey);
  }
  
  let t = stripCounters(title);
  
  if (isBrowserApp(appName)) {
    // Remove common app suffix patterns using pre-compiled regex
    t = t.replace(BROWSER_SUFFIX_REGEX, '').trim();
    
    // Apply domain-specific normalization
    t = applyDomainNormalization(t, appName);
  }
  
  // Cache the result (with size limit)
  if (titleCache.size >= CACHE_MAX_SIZE) {
    // Remove oldest entry (simple FIFO)
    const firstKey = titleCache.keys().next().value;
    titleCache.delete(firstKey);
  }
  titleCache.set(cacheKey, t);
  
  return t;
}

module.exports = { normalizeTitle, isBrowserApp };

