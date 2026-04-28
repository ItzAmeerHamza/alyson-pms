/**
 * Title Extraction Tests
 */

import { 
  extractUrlFromTitle, 
  isSpecialPageTitle, 
  extractUrlFromTitleWithBrowser 
} from '../src/modules/url/titleExtract';

describe('Title Extraction', () => {
  describe('extractUrlFromTitle', () => {
    it('should extract full URLs from title', () => {
      expect(extractUrlFromTitle('https://example.com - Example Site'))
        .toBe('https://example.com');
      
      expect(extractUrlFromTitle('Page Title (https://example.com/path)')
        .toBe('https://example.com/path');
      
      expect(extractUrlFromTitle('http://localhost:3000 - Development'))
        .toBe('http://localhost:3000');
    });

    it('should extract domains with common separators', () => {
      // Dash separator
      expect(extractUrlFromTitle('Example Page - example.com'))
        .toBe('https://example.com');
      
      // Bullet separator
      expect(extractUrlFromTitle('Example Page • example.com'))
        .toBe('https://example.com');
      
      // Pipe separator
      expect(extractUrlFromTitle('Example Page | example.com'))
        .toBe('https://example.com');
      
      // Em dash
      expect(extractUrlFromTitle('Example Page — example.com'))
        .toBe('https://example.com');
      
      // Domain first
      expect(extractUrlFromTitle('example.com - Example Page'))
        .toBe('https://example.com');
    });

    it('should handle domains with paths', () => {
      expect(extractUrlFromTitle('Page - example.com/path/to/page'))
        .toBe('https://example.com/path/to/page');
      
      expect(extractUrlFromTitle('example.com/docs - Documentation'))
        .toBe('https://example.com/docs');
    });

    it('should handle subdomains', () => {
      expect(extractUrlFromTitle('App - app.example.com'))
        .toBe('https://app.example.com');
      
      expect(extractUrlFromTitle('sub.domain.example.com | Title'))
        .toBe('https://sub.domain.example.com');
    });

    it('should find domains anywhere in title', () => {
      expect(extractUrlFromTitle('Visit example.com for more info'))
        .toBe('https://example.com');
      
      expect(extractUrlFromTitle('The site (example.com) has info'))
        .toBe('https://example.com');
    });

    it('should ignore file extensions and emails', () => {
      expect(extractUrlFromTitle('document.pdf - PDF Viewer'))
        .toBeNull();
      
      expect(extractUrlFromTitle('image.jpg preview'))
        .toBeNull();
      
      expect(extractUrlFromTitle('Contact: user@example.com'))
        .toBeNull();
      
      expect(extractUrlFromTitle('Email admin@company.com for help'))
        .toBeNull();
    });

    it('should handle edge cases', () => {
      expect(extractUrlFromTitle('')).toBeNull();
      expect(extractUrlFromTitle(null as any)).toBeNull();
      expect(extractUrlFromTitle('No URL here')).toBeNull();
      expect(extractUrlFromTitle('Just a regular title')).toBeNull();
    });

    it('should clean up trailing characters from URLs', () => {
      expect(extractUrlFromTitle('Visit https://example.com, today!'))
        .toBe('https://example.com');
      
      expect(extractUrlFromTitle('Link: https://example.com;'))
        .toBe('https://example.com');
      
      expect(extractUrlFromTitle('(see https://example.com)'))
        .toBe('https://example.com');
    });
  });

  describe('isSpecialPageTitle', () => {
    it('should identify special pages', () => {
      expect(isSpecialPageTitle('New Tab')).toBe(true);
      expect(isSpecialPageTitle('new tab')).toBe(true);
      expect(isSpecialPageTitle('Blank Page')).toBe(true);
      expect(isSpecialPageTitle('Untitled')).toBe(true);
      expect(isSpecialPageTitle('about:blank')).toBe(true);
      expect(isSpecialPageTitle('chrome://settings')).toBe(true);
      expect(isSpecialPageTitle('Settings - Chrome')).toBe(true);
      expect(isSpecialPageTitle('Preferences')).toBe(true);
      expect(isSpecialPageTitle('Extensions')).toBe(true);
      expect(isSpecialPageTitle('Downloads')).toBe(true);
      expect(isSpecialPageTitle('History')).toBe(true);
      expect(isSpecialPageTitle('Bookmarks Manager')).toBe(true);
    });

    it('should not identify regular pages as special', () => {
      expect(isSpecialPageTitle('Example Website')).toBe(false);
      expect(isSpecialPageTitle('GitHub - Code Repository')).toBe(false);
      expect(isSpecialPageTitle('My Blog Post')).toBe(false);
    });

    it('should handle empty/null titles', () => {
      expect(isSpecialPageTitle('')).toBe(true);
      expect(isSpecialPageTitle(null as any)).toBe(true);
    });
  });

  describe('extractUrlFromTitleWithBrowser', () => {
    it('should handle Firefox-specific patterns', () => {
      expect(extractUrlFromTitleWithBrowser(
        'Example Page — Mozilla Firefox',
        'firefox'
      )).toBe(null); // Just removes suffix, no domain
      
      expect(extractUrlFromTitleWithBrowser(
        'example.com - Example — Mozilla Firefox',
        'firefox'
      )).toBe('https://example.com');
    });

    it('should handle Safari-specific patterns', () => {
      expect(extractUrlFromTitleWithBrowser(
        'Example Page — Private Browsing',
        'safari'
      )).toBe(null);
      
      expect(extractUrlFromTitleWithBrowser(
        'example.com — Private Browsing',
        'safari'
      )).toBe('https://example.com');
    });

    it('should handle Edge-specific patterns', () => {
      expect(extractUrlFromTitleWithBrowser(
        'Example Page - Microsoft Edge',
        'edge'
      )).toBe(null);
      
      expect(extractUrlFromTitleWithBrowser(
        'example.com - Microsoft Edge',
        'edge'
      )).toBe('https://example.com');
    });

    it('should skip special pages', () => {
      expect(extractUrlFromTitleWithBrowser(
        'New Tab - Mozilla Firefox',
        'firefox'
      )).toBeNull();
      
      expect(extractUrlFromTitleWithBrowser(
        'Settings - Microsoft Edge',
        'edge'
      )).toBeNull();
    });

    it('should fall back to generic extraction', () => {
      expect(extractUrlFromTitleWithBrowser(
        'https://example.com - Page',
        'chrome'
      )).toBe('https://example.com');
    });

    it('should handle empty/null inputs', () => {
      expect(extractUrlFromTitleWithBrowser('', 'chrome')).toBeNull();
      expect(extractUrlFromTitleWithBrowser(null as any, 'chrome')).toBeNull();
    });
  });
});

