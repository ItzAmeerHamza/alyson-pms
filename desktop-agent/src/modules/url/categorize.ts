/**
 * Simple URL categorization helper
 */

export type UrlCategory = 'work' | 'comm' | 'social' | 'media' | 'dev' | 'other';

const DOMAIN_CATEGORY_MAP: Record<string, UrlCategory> = {
  'github.com': 'dev',
  'gitlab.com': 'dev',
  'bitbucket.org': 'dev',
  'figma.com': 'work',
  'notion.so': 'work',
  'slack.com': 'comm',
  'teams.microsoft.com': 'comm',
  'meet.google.com': 'comm',
  'zoom.us': 'comm',
  'youtube.com': 'media',
  'twitter.com': 'social',
  'x.com': 'social',
  'facebook.com': 'social',
  'linkedin.com': 'social'
};

export function categorizeDomain(domain: string | null | undefined): UrlCategory {
  if (!domain) return 'other';
  const d = domain.toLowerCase();
  return DOMAIN_CATEGORY_MAP[d] ?? 'other';
}


