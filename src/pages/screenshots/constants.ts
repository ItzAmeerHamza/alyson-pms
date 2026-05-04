import { Smartphone, Gamepad2, Activity, Globe, BarChart3, AlertTriangle, TrendingDown, Zap } from 'lucide-react';
import { AIContentPattern, ContentCategoryDisplay, DistractionBadge } from './types';

// AI Content Detection Patterns
export const AI_CONTENT_PATTERNS: Record<string, AIContentPattern> = {
  social_media: {
    domains: ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com', 'snapchat.com', 'reddit.com', 'pinterest.com', 'whatsapp.com', 'telegram.org', 'discord.com'],
    apps: ['facebook', 'instagram', 'twitter', 'tiktok', 'snapchat', 'reddit', 'pinterest', 'whatsapp', 'telegram', 'discord', 'slack'],
    keywords: ['social', 'chat', 'message', 'post', 'share', 'like', 'comment', 'follow', 'friend'],
    score: 85
  },
  gaming: {
    domains: ['steam.com', 'epic.com', 'epicgames.com', 'battlenet.com', 'blizzard.com', 'origin.com', 'uplay.com', 'minecraft.net', 'roblox.com', 'twitch.tv/games', 'itch.io', 'gog.com'],
    apps: ['steam', 'epic', 'battlenet', 'minecraft', 'roblox', 'league of legends', 'valorant', 'fortnite', 'among us', 'call of duty'],
    keywords: ['game', 'play', 'player', 'level', 'score', 'achievement', 'quest', 'battle', 'gaming'],
    score: 90
  },
  entertainment: {
    domains: ['youtube.com', 'youtu.be', 'm.youtube.com', 'www.youtube.com', 'netflix.com', 'hulu.com', 'disney.com', 'twitch.tv', 'spotify.com', 'soundcloud.com', 'primevideo.com', 'hbomax.com', 'peacocktv.com', 'paramountplus.com', 'crunchyroll.com', 'vimeo.com', 'dailymotion.com'],
    apps: ['youtube', 'youtube music', 'youtube tv', 'netflix', 'hulu', 'disney', 'twitch', 'spotify', 'vlc', 'media player', 'music', 'video', 'google chrome', 'safari', 'firefox', 'edge'],
    keywords: ['youtube', 'video', 'music', 'movie', 'show', 'stream', 'streaming', 'watch', 'watching', 'listen', 'listening', 'entertainment', 'media', 'subscribe', 'channel', 'playlist', 'recommended', 'trending', 'views', 'likes'],
    score: 75
  },
  news: {
    domains: ['cnn.com', 'bbc.com', 'fox.com', 'reuters.com', 'ap.org', 'news.google.com', 'yahoo.com/news', 'msn.com/news', 'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'huffpost.com'],
    apps: ['news', 'apple news', 'google news'],
    keywords: ['news', 'breaking', 'politics', 'world', 'current', 'headline', 'article', 'report'],
    score: 40
  },
  shopping: {
    domains: ['amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'alibaba.com', 'aliexpress.com', 'etsy.com', 'shopify.com', 'bestbuy.com', 'newegg.com'],
    apps: ['amazon', 'ebay', 'walmart', 'target', 'shopping'],
    keywords: ['buy', 'shop', 'cart', 'purchase', 'price', 'deal', 'sale', 'order', 'product'],
    score: 60
  }
};

// Content category display configurations
export const getContentCategoryDisplay = (category: string, distractionScore: number): ContentCategoryDisplay => {
  switch (category) {
    case 'social_media':
      return {
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: Smartphone,
        label: 'Social Media',
        severity: distractionScore > 70 ? 'high' : 'medium'
      };
    case 'gaming':
      return {
        color: 'bg-purple-100 text-purple-800 border-purple-200',
        icon: Gamepad2,
        label: 'Gaming',
        severity: 'high'
      };
    case 'entertainment':
      return {
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        icon: Activity,
        label: 'Entertainment',
        severity: distractionScore > 60 ? 'medium' : 'low'
      };
    case 'news':
      return {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: Globe,
        label: 'News',
        severity: 'low'
      };
    case 'shopping':
      return {
        color: 'bg-pink-100 text-pink-800 border-pink-200',
        icon: BarChart3,
        label: 'Shopping',
        severity: 'medium'
      };
    default:
      return {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: Activity,
        label: 'Productive',
        severity: 'none'
      };
  }
};

// Distraction severity badge configurations
export const getDistractionBadge = (distractionScore: number): DistractionBadge => {
  if (distractionScore >= 80) {
    return {
      color: 'bg-red-500 text-white',
      label: 'High Distraction',
      icon: AlertTriangle
    };
  } else if (distractionScore >= 60) {
    return {
      color: 'bg-orange-500 text-white',
      label: 'Medium Distraction',
      icon: TrendingDown
    };
  } else if (distractionScore >= 30) {
    return {
      color: 'bg-yellow-500 text-white',
      label: 'Low Distraction',
      icon: Zap
    };
  } else {
    return {
      color: 'bg-green-500 text-white',
      label: 'Focused',
      icon: Activity
    };
  }
};

// Default filter options
export const DEFAULT_FILTER_OPTIONS: Omit<import('./types').FilterOptions, 'selectedDate'> = {
  userFilter: 'all',
  projectFilter: 'all', 
  contentFilter: 'all',
  distractionFilter: 'all',
  searchTerm: '',
  viewMode: 'time-grouped'
};

/** Manual screenshot AI (Edge function `ai-screenshot-analyzer`) — DeepSeek only */
export const DEEPSEEK_SCREENSHOT_MODEL_OPTIONS = [
  { id: 'deepseek-v4-flash' as const, label: 'V4 Flash (fast)' },
  { id: 'deepseek-v4-pro' as const, label: 'V4 Pro (quality)' },
] as const;

export type DeepseekScreenshotModelId = (typeof DEEPSEEK_SCREENSHOT_MODEL_OPTIONS)[number]['id'];

export const DEFAULT_DEEPSEEK_SCREENSHOT_MODEL: DeepseekScreenshotModelId = 'deepseek-v4-flash';

export const STORAGE_KEY_MANUAL_DEEPSEEK_MODEL = 'screenshots_manual_deepseek_model';