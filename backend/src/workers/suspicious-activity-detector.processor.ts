import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
@Processor('suspicious-activity-detector')
export class SuspiciousActivityDetectorProcessor {
  private readonly logger = new Logger(SuspiciousActivityDetectorProcessor.name);

  constructor(private supabaseService: SupabaseService) {}

  @Process('detect-suspicious-activity')
  async detectSuspiciousActivity(job: Job) {
    try {
      this.logger.log('Starting suspicious activity detection...');
      
      const supabase = this.supabaseService.getClient();
      const now = new Date();
      const last30Minutes = new Date(now.getTime() - 30 * 60 * 1000);

      // Get all active users (with organization_id for multi-tenant filtering)
      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name, organization_id')
        .eq('status', 'active');

      if (!users || users.length === 0) {
        this.logger.log('No active users found');
        return;
      }

      let totalDetections = 0;

      // Process each user
      for (const user of users) {
        try {
          const detections = await this.analyzeUserActivity(user.id, last30Minutes, now);
          
          // Save significant detections
          for (const detection of detections) {
            await this.saveSuspiciousActivity(user.id, detection, user.organization_id);
            totalDetections++;
          }
        } catch (error) {
          this.logger.error(`Failed to analyze user ${user.id}:`, error);
        }
      }

      this.logger.log(`✅ Suspicious activity detection completed. Found ${totalDetections} detections`);
    } catch (error) {
      this.logger.error('❌ Suspicious activity detection failed:', error);
      throw error;
    }
  }

  private async analyzeUserActivity(userId: string, startDate: Date, endDate: Date) {
    const supabase = this.supabaseService.getClient();
    const detections = [];

    // Suspicious patterns (same as frontend)
    const SUSPICIOUS_PATTERNS = {
      social_media: [
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com',
        'snapchat.com', 'reddit.com', 'pinterest.com', 'whatsapp.com', 'telegram.org',
        'discord.com', 'teams.microsoft.com'
      ],
      entertainment: [
        'youtube.com', 'netflix.com', 'hulu.com', 'disney.com', 'twitch.tv',
        'spotify.com', 'soundcloud.com', 'primevideo.com', 'hbomax.com'
      ],
      gaming: [
        'steam.com', 'epic.com', 'epicgames.com', 'battlenet.com', 'blizzard.com',
        'minecraft.net', 'roblox.com', 'origin.com', 'uplay.com'
      ],
      shopping: [
        'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'alibaba.com',
        'aliexpress.com', 'etsy.com', 'shopify.com'
      ]
    };

    // Check if already analyzed recently
    const { data: recentAnalysis } = await supabase
      .from('suspicious_activity')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(1);

    if (recentAnalysis && recentAnalysis.length > 0) {
      // Skip if already analyzed in last 30 minutes
      return detections;
    }

    // Get URL logs
    const { data: urlLogs } = await supabase
      .from('url_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString())
      .order('timestamp', { ascending: false });

    if (!urlLogs || urlLogs.length === 0) {
      return detections;
    }

    // Analyze URL patterns
    let socialMediaCount = 0;
    let entertainmentCount = 0;
    let gamingCount = 0;
    let shoppingCount = 0;
    let totalRiskScore = 0;

    urlLogs.forEach(log => {
      const url = (log.site_url || log.url || log.domain || '').toLowerCase();
      const title = (log.title || '').toLowerCase();
      const allText = `${url} ${title}`;

      if (SUSPICIOUS_PATTERNS.social_media.some(domain => allText.includes(domain))) {
        socialMediaCount++;
        totalRiskScore += 3;
      } else if (SUSPICIOUS_PATTERNS.entertainment.some(domain => allText.includes(domain))) {
        entertainmentCount++;
        totalRiskScore += 4;
      } else if (SUSPICIOUS_PATTERNS.gaming.some(domain => allText.includes(domain))) {
        gamingCount++;
        totalRiskScore += 5;
      } else if (SUSPICIOUS_PATTERNS.shopping.some(domain => allText.includes(domain))) {
        shoppingCount++;
        totalRiskScore += 2;
      }
    });

    // Generate detections based on thresholds
    const flags = [];
    
    if (socialMediaCount > 2) {
      flags.push('High social media usage');
      detections.push({
        activity_type: 'social_media_usage',
        risk_score: Math.min(socialMediaCount * 3, 30),
        details: `${socialMediaCount} social media visits detected`,
        category: 'social_media'
      });
    }

    if (entertainmentCount > 1) {
      flags.push('Entertainment usage during work');
      detections.push({
        activity_type: 'entertainment_usage',
        risk_score: Math.min(entertainmentCount * 4, 40),
        details: `${entertainmentCount} entertainment sites visited`,
        category: 'entertainment'
      });
    }

    if (gamingCount > 0) {
      flags.push('Gaming activity detected');
      detections.push({
        activity_type: 'gaming_activity',
        risk_score: Math.min(gamingCount * 5, 50),
        details: `${gamingCount} gaming sites visited`,
        category: 'gaming'
      });
    }

    if (shoppingCount > 2) {
      flags.push('Shopping activity detected');
      detections.push({
        activity_type: 'shopping_activity',
        risk_score: Math.min(shoppingCount * 2, 20),
        details: `${shoppingCount} shopping sites visited`,
        category: 'shopping'
      });
    }

    // High risk combination
    if (totalRiskScore > 15) {
      detections.push({
        activity_type: 'high_risk_behavior',
        risk_score: Math.min(totalRiskScore, 100),
        details: `Multiple unproductive activities detected (Social: ${socialMediaCount}, Entertainment: ${entertainmentCount}, Gaming: ${gamingCount}, Shopping: ${shoppingCount})`,
        category: 'high_risk'
      });
    }

    return detections;
  }

  private async saveSuspiciousActivity(userId: string, detection: any, organizationId?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      await supabase
        .from('suspicious_activity')
        .insert({
          user_id: userId,
          activity_type: detection.activity_type,
          risk_score: detection.risk_score,
          details: detection.details,
          category: detection.category,
          timestamp: new Date().toISOString(),
          reviewed: false,
          organization_id: organizationId || null
        });
        
      this.logger.log(`✅ Saved suspicious activity: ${detection.activity_type} for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to save suspicious activity:', error);
    }
  }
} 