/**
 * Gemini Client for TimeFlow AI Analysis
 * 
 * Supports:
 * - Gemini 2.5 Flash-Lite for text analysis and reasoning
 * - Gemini 2.5 Flash-Lite for vision/image analysis (same model handles both)
 * 
 * Token: Configured via GEMINI_API_KEY environment variable
 * Fallback: HF_API_TOKEN for HuggingFace if Gemini key is not set
 */

// Gemini API (OpenAI-compatible endpoint)
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// HuggingFace fallback
const HF_ROUTER = 'https://router.huggingface.co/v1/chat/completions';

const MODELS = {
  TEXT: 'gemini-2.5-flash-lite',
  VISION: 'gemini-2.5-flash-lite',
  TEXT_FALLBACK: 'gemini-2.5-flash-lite',
};

// OpenAI-compatible chat completions response format
interface HFChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: string;
}

interface AnalysisResult {
  success: boolean;
  content?: string;
  error?: string;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface VisionAnalysisResult {
  success: boolean;
  content?: string;
  category?: string;
  is_work_related?: boolean;
  confidence?: number;
  detected_content?: string;
  privacy_concerns?: string[];
  is_idle?: boolean;
  error?: string;
  model?: string;
}

import { createClient } from 'npm:@supabase/supabase-js@2';

let _cachedGeminiKey: string | null = null;

async function getGeminiKeyFromVault(): Promise<string | null> {
  if (_cachedGeminiKey) return _cachedGeminiKey;
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data } = await supabase.rpc('get_secret', { secret_name: 'GEMINI_API_KEY' }).single();
    if (data?.decrypted_secret) {
      _cachedGeminiKey = data.decrypted_secret;
      return _cachedGeminiKey;
    }
  } catch (e) {
    console.warn('Failed to fetch GEMINI_API_KEY from vault:', e);
  }
  return null;
}

/**
 * Get the API token and endpoint URL.
 * Priority: GEMINI_API_KEY env -> vault -> HF_API_TOKEN env.
 */
async function getApiConfig(): Promise<{ token: string; url: string }> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || await getGeminiKeyFromVault();
  if (geminiKey) {
    return { token: geminiKey, url: GEMINI_API_URL };
  }
  const hfToken = Deno.env.get('HF_API_TOKEN');
  if (hfToken) {
    console.warn('GEMINI_API_KEY not set, falling back to HF_API_TOKEN');
    return { token: hfToken, url: HF_ROUTER };
  }
  throw new Error('Neither GEMINI_API_KEY nor HF_API_TOKEN is available');
}

/**
 * Make a request to Hugging Face API with retry logic
 */
async function makeHFRequest(
  model: string,
  messages: Array<{role: string; content: any}>,
  options: { maxTokens?: number; temperature?: number } = {},
  retries = 3,
  timeoutMs = 30000
): Promise<any> {
  const { token, url } = await getApiConfig();
  const { maxTokens = 1000, temperature = 0.7 } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle rate limiting / quota exhaustion
        if (response.status === 429) {
          if (errorText.includes('RESOURCE_EXHAUSTED') || errorText.includes('quota') || errorText.includes('spending')) {
            console.warn('API spending cap / quota reached - not retrying');
            throw new Error('API spending cap reached (RESOURCE_EXHAUSTED)');
          }
          const retryAfter = response.headers.get('Retry-After') || '5';
          const waitTime = parseInt(retryAfter) * 1000;
          console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // Handle model loading
        if (response.status === 503 && errorText.includes('loading')) {
          console.log(`Model loading. Waiting 10s before retry (attempt ${attempt}/${retries})...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          continue;
        }
        
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`Request timeout (attempt ${attempt}/${retries})`);
      } else {
        console.error(`HF request error (attempt ${attempt}/${retries}):`, error.message);
      }
      
      if (attempt === retries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw new Error('Max retries exceeded');
}

/**
 * Analyze text content using GLM-4.7
 * 
 * @param prompt - The system prompt/instruction
 * @param content - The content to analyze
 * @returns Analysis result
 */
export async function analyzeText(
  prompt: string,
  content: string,
  options: {
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<AnalysisResult> {
  try {
    const { maxTokens = 1000, temperature = 0.7 } = options;
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: content },
    ];
    
    let response;
    let usedModel = MODELS.TEXT;
    
    try {
      response = await makeHFRequest(MODELS.TEXT, messages, { maxTokens, temperature });
    } catch (error) {
      console.log('Primary text model unavailable, trying fallback model...');
      usedModel = MODELS.TEXT_FALLBACK;
      response = await makeHFRequest(MODELS.TEXT_FALLBACK, messages, { maxTokens, temperature });
    }
    
    // Parse response from OpenAI-compatible format
    let generatedText = response.choices?.[0]?.message?.content || '';
    
    if (!generatedText) {
      throw new Error('No text generated from model');
    }
    
    return {
      success: true,
      content: generatedText.trim(),
      model: usedModel,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
      } : undefined,
    };
  } catch (error: any) {
    console.error('Text analysis error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Analyze screenshot image using Qwen2-VL vision model
 * 
 * @param imageUrl - URL to the screenshot image
 * @param prompt - Optional custom prompt for analysis
 * @returns Vision analysis result with category, work-related flag, etc.
 */
export async function analyzeScreenshotImage(
  imageUrl: string,
  prompt?: string
): Promise<VisionAnalysisResult> {
  try {
    const defaultPrompt = `Analyze this screenshot and provide a JSON response with the following fields:
1. "detected_content": Brief description of what's visible (max 50 words)
2. "category": One of: "productive", "social_media", "entertainment", "gaming", "shopping", "communication", "other"
3. "is_work_related": true or false
4. "confidence": Number between 0 and 1
5. "privacy_concerns": Array of any privacy concerns (passwords, banking, personal info visible)
6. "is_idle": true if lock screen, screensaver, or login prompt visible

Respond ONLY with valid JSON, no other text.`;

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: prompt || defaultPrompt }
        ]
      }
    ];
    
    const response = await makeHFRequest(MODELS.VISION, messages, { maxTokens: 500, temperature: 0.3 }, 2, 60000);
    
    // Parse response from OpenAI-compatible format
    let generatedText = response.choices?.[0]?.message?.content || '';
    
    // Try to parse as JSON
    try {
      // Extract JSON from response if wrapped in other text
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          content: generatedText,
          category: parsed.category || 'other',
          is_work_related: parsed.is_work_related ?? true,
          confidence: parsed.confidence ?? 0.5,
          detected_content: parsed.detected_content || 'Unknown content',
          privacy_concerns: parsed.privacy_concerns || [],
          is_idle: parsed.is_idle ?? false,
          model: MODELS.VISION,
        };
      }
    } catch (parseError) {
      console.log('Could not parse vision response as JSON, using text analysis');
    }
    
    // Fallback: analyze the text response
    const lowerText = generatedText.toLowerCase();
    return {
      success: true,
      content: generatedText,
      category: inferCategoryFromText(lowerText),
      is_work_related: !lowerText.includes('game') && !lowerText.includes('social') && !lowerText.includes('entertainment'),
      confidence: 0.6,
      detected_content: generatedText.substring(0, 200),
      privacy_concerns: detectPrivacyConcerns(lowerText),
      is_idle: lowerText.includes('lock') || lowerText.includes('login') || lowerText.includes('screensaver'),
      model: MODELS.VISION,
    };
  } catch (error: any) {
    console.error('Vision analysis error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Analyze screenshot metadata (window title, app name) for categorization
 */
export async function analyzeScreenshotMetadata(
  windowTitle: string,
  appName: string,
  url?: string
): Promise<AnalysisResult> {
  const prompt = `You are an AI that analyzes employee computer activity for a time tracking system.
Analyze the following screenshot metadata and provide a JSON response:

{
  "category": "productive" | "social_media" | "entertainment" | "gaming" | "shopping" | "communication" | "other",
  "activity_type": "coding" | "document" | "spreadsheet" | "email" | "meeting" | "browsing" | "design" | "gaming" | "social" | "video" | "music" | "shopping" | "other",
  "is_work_related": true | false,
  "distraction_score": 0-100,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification"
}

Consider context: YouTube tutorials are work-related, Slack #work channels are productive, etc.
Respond ONLY with valid JSON.`;

  const content = `Window Title: ${windowTitle || 'Unknown'}
Application: ${appName || 'Unknown'}
URL: ${url || 'N/A'}`;

  return analyzeText(prompt, content, { maxTokens: 300, temperature: 0.3 });
}

/**
 * Generate AI summary for employee productivity
 */
export async function generateProductivitySummary(
  employeeName: string,
  data: {
    totalHours: number;
    screenshotsAnalyzed: number;
    productiveCount: number;
    distractionCount: number;
    topApps: string[];
    topCategories: Record<string, number>;
    activityByHour?: Record<string, number>;
  }
): Promise<AnalysisResult> {
  const prompt = `You are an AI assistant generating productivity insights for a time tracking system.
Create a professional, constructive summary for an admin reviewing employee activity.

Include:
1. Executive summary (2-3 sentences)
2. Productivity analysis
3. Key observations
4. Constructive recommendations

Be factual, avoid assumptions, and maintain a supportive tone.`;

  const content = `Employee: ${employeeName}
Total Hours Tracked: ${data.totalHours}
Screenshots Analyzed: ${data.screenshotsAnalyzed}
Productive Screenshots: ${data.productiveCount}
Potential Distractions: ${data.distractionCount}
Top Applications: ${data.topApps.join(', ')}
Activity Categories: ${JSON.stringify(data.topCategories)}
${data.activityByHour ? `Activity by Hour: ${JSON.stringify(data.activityByHour)}` : ''}`;

  return analyzeText(prompt, content, { maxTokens: 800, temperature: 0.7 });
}

/**
 * Detect anomalies in user behavior
 */
export async function detectAnomalies(
  userId: string,
  currentActivity: {
    app: string;
    title: string;
    time: string;
    dayOfWeek: number;
  },
  historicalPatterns: {
    typicalApps: string[];
    typicalHours: { start: number; end: number };
    avgProductivity: number;
  }
): Promise<AnalysisResult> {
  const prompt = `You are an AI detecting anomalies in employee computer usage.
Compare current activity against historical patterns and identify if this is unusual.

Respond with JSON:
{
  "is_anomaly": true | false,
  "anomaly_type": "unusual_app" | "unusual_hours" | "unusual_activity" | "none",
  "severity": "low" | "medium" | "high",
  "reasoning": "Brief explanation"
}`;

  const content = `Current Activity:
- Application: ${currentActivity.app}
- Window: ${currentActivity.title}
- Time: ${currentActivity.time}
- Day: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentActivity.dayOfWeek]}

Historical Patterns:
- Typical Apps: ${historicalPatterns.typicalApps.join(', ')}
- Typical Hours: ${historicalPatterns.typicalHours.start}:00 - ${historicalPatterns.typicalHours.end}:00
- Average Productivity: ${historicalPatterns.avgProductivity}%`;

  return analyzeText(prompt, content, { maxTokens: 200, temperature: 0.3 });
}

// Helper functions

function inferCategoryFromText(text: string): string {
  if (text.includes('game') || text.includes('gaming') || text.includes('steam') || text.includes('play')) {
    return 'gaming';
  }
  if (text.includes('facebook') || text.includes('instagram') || text.includes('twitter') || text.includes('social')) {
    return 'social_media';
  }
  if (text.includes('youtube') || text.includes('netflix') || text.includes('video') || text.includes('movie')) {
    return 'entertainment';
  }
  if (text.includes('code') || text.includes('ide') || text.includes('terminal') || text.includes('develop')) {
    return 'productive';
  }
  if (text.includes('document') || text.includes('word') || text.includes('excel') || text.includes('spreadsheet')) {
    return 'productive';
  }
  if (text.includes('shop') || text.includes('cart') || text.includes('amazon') || text.includes('buy')) {
    return 'shopping';
  }
  if (text.includes('slack') || text.includes('teams') || text.includes('email') || text.includes('chat')) {
    return 'communication';
  }
  return 'other';
}

function detectPrivacyConcerns(text: string): string[] {
  const concerns: string[] = [];
  if (text.includes('password') || text.includes('login')) {
    concerns.push('Authentication page detected');
  }
  if (text.includes('bank') || text.includes('paypal') || text.includes('credit card')) {
    concerns.push('Financial information detected');
  }
  if (text.includes('medical') || text.includes('health') || text.includes('patient')) {
    concerns.push('Medical information detected');
  }
  if (text.includes('social security') || text.includes('ssn')) {
    concerns.push('Personal identification detected');
  }
  return concerns;
}

// Export models for reference
export const AI_MODELS = MODELS;





