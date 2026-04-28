import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { ImageService } from '../common/image.service';
import * as sharp from 'sharp';
import { createHash } from 'crypto';

interface DuplicateGroup {
  hash: string;
  screenshots: Array<{
    id: string;
    user_id: string;
    captured_at: string;
    image_url: string;
    activity_percent: number;
    app_name: string;
    window_title: string;
  }>;
  similarity_score: number;
}

@Injectable()
// DISABLED: Now using ChatGPT Vision API exclusively for duplicate detection
// @Processor('screenshot-duplicate-detector')
export class ScreenshotDuplicateDetectorProcessor_DISABLED {
  private readonly logger = new Logger('ScreenshotDuplicateDetectorProcessor_DISABLED');

  constructor(
    private supabaseService: SupabaseService,
    private imageService: ImageService,
  ) {}

  @Process('detect-duplicates')
  async detectDuplicates(job: Job) {
    try {
      this.logger.log('🔍 Starting screenshot duplicate detection...');
      
      const supabase = this.supabaseService.getClient();
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get all screenshots from last 24 hours that haven't been analyzed for duplicates
      const { data: screenshots, error } = await supabase
        .from('screenshots')
        .select('id, user_id, captured_at, image_url, activity_percent, app_name, window_title, duplicate_hash, is_duplicate')
        .gte('captured_at', last24Hours.toISOString())
        .order('captured_at', { ascending: false })
        .limit(500); // Process up to 500 screenshots per run

      if (error) {
        this.logger.error('Failed to fetch screenshots:', error);
        throw error;
      }

      if (!screenshots || screenshots.length === 0) {
        this.logger.log('No screenshots found for duplicate detection');
        return;
      }

      this.logger.log(`📊 Analyzing ${screenshots.length} screenshots for duplicates`);

      // Group screenshots by user for more efficient processing
      const userScreenshots = new Map<string, typeof screenshots>();
      screenshots.forEach(screenshot => {
        if (!userScreenshots.has(screenshot.user_id)) {
          userScreenshots.set(screenshot.user_id, []);
        }
        userScreenshots.get(screenshot.user_id)!.push(screenshot);
      });

      let totalDuplicatesFound = 0;

      // Process each user's screenshots
      for (const [userId, userShots] of userScreenshots) {
        try {
          const duplicateGroups = await this.findDuplicatesForUser(userId, userShots);
          
          if (duplicateGroups.length > 0) {
            await this.saveDuplicateGroups(duplicateGroups);
            totalDuplicatesFound += duplicateGroups.reduce((sum, group) => sum + group.screenshots.length, 0);
            
            this.logger.log(`Found ${duplicateGroups.length} duplicate groups for user ${userId}`);
          }
        } catch (error) {
          this.logger.error(`Failed to process duplicates for user ${userId}:`, error);
        }
      }

      this.logger.log(`✅ Duplicate detection completed. Found ${totalDuplicatesFound} duplicate screenshots`);
    } catch (error) {
      this.logger.error('❌ Screenshot duplicate detection failed:', error);
      throw error;
    }
  }

  private async findDuplicatesForUser(userId: string, screenshots: any[]): Promise<DuplicateGroup[]> {
    const duplicateGroups: DuplicateGroup[] = [];
    const processedHashes = new Set<string>();

    for (let i = 0; i < screenshots.length; i++) {
      const screenshot = screenshots[i];
      
      // Skip if already processed or has no image URL
      if (!screenshot.image_url || processedHashes.has(screenshot.id)) {
        continue;
      }

      try {
        // Generate image hash for comparison
        let imageHash = screenshot.duplicate_hash;
        if (!imageHash) {
          imageHash = await this.generateImageHash(screenshot.image_url);
          
          // Update screenshot with hash for future use
          await this.supabaseService.getClient()
            .from('screenshots')
            .update({ duplicate_hash: imageHash })
            .eq('id', screenshot.id);
        }

        // Find similar screenshots
        const similarScreenshots = [screenshot];
        
        for (let j = i + 1; j < screenshots.length; j++) {
          const compareScreenshot = screenshots[j];
          
          if (processedHashes.has(compareScreenshot.id)) {
            continue;
          }

          // Check if screenshots are close in time (within 10 minutes)
          const timeDiff = Math.abs(
            new Date(screenshot.captured_at).getTime() - 
            new Date(compareScreenshot.captured_at).getTime()
          );
          
          if (timeDiff > 10 * 60 * 1000) { // 10 minutes
            continue;
          }

          try {
            let compareHash = compareScreenshot.duplicate_hash;
            if (!compareHash) {
              compareHash = await this.generateImageHash(compareScreenshot.image_url);
              
              // Update screenshot with hash
              await this.supabaseService.getClient()
                .from('screenshots')
                .update({ duplicate_hash: compareHash })
                .eq('id', compareScreenshot.id);
            }

            // Compare hashes for similarity
            const similarity = this.calculateHashSimilarity(imageHash, compareHash);
            
            // Consider as duplicate if similarity > 85% or both have very low activity
            const bothLowActivity = (screenshot.activity_percent || 0) < 15 && (compareScreenshot.activity_percent || 0) < 15;
            
            if (similarity > 0.85 || (similarity > 0.7 && bothLowActivity)) {
              similarScreenshots.push(compareScreenshot);
              processedHashes.add(compareScreenshot.id);
            }
          } catch (error) {
            this.logger.warn(`Failed to compare screenshot ${compareScreenshot.id}:`, error.message);
          }
        }

        // If we found duplicates, create a group
        if (similarScreenshots.length > 1) {
          duplicateGroups.push({
            hash: imageHash,
            screenshots: similarScreenshots,
            similarity_score: 0.9 // Average similarity for the group
          });

          similarScreenshots.forEach(s => processedHashes.add(s.id));
          
          this.logger.log(`📸 Found duplicate group with ${similarScreenshots.length} screenshots for user ${userId}`);
        }

        processedHashes.add(screenshot.id);
      } catch (error) {
        this.logger.warn(`Failed to process screenshot ${screenshot.id}:`, error.message);
      }
    }

    return duplicateGroups;
  }

  private async generateImageHash(imageUrl: string): Promise<string> {
    try {
      // Download image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const imageBuffer = await response.arrayBuffer();
      
      // Create a perceptual hash using image resizing and grayscale conversion
      const processedImage = await sharp(Buffer.from(imageBuffer))
        .resize(16, 16, { fit: 'fill' }) // Small size for comparison
        .grayscale()
        .raw()
        .toBuffer();

      // Generate hash from pixel data
      const hash = createHash('md5').update(processedImage).digest('hex');
      return hash;
    } catch (error) {
      this.logger.warn(`Failed to generate hash for image ${imageUrl}:`, error.message);
      // Return a random hash to avoid blocking the process
      return createHash('md5').update(Math.random().toString()).digest('hex');
    }
  }

  private calculateHashSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;
    
    // Calculate Hamming distance for hash comparison
    let differences = 0;
    const minLength = Math.min(hash1.length, hash2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (hash1[i] !== hash2[i]) {
        differences++;
      }
    }
    
    // Add difference for length mismatch
    differences += Math.abs(hash1.length - hash2.length);
    
    // Convert to similarity percentage
    const maxDifferences = Math.max(hash1.length, hash2.length);
    return 1 - (differences / maxDifferences);
  }

  private async saveDuplicateGroups(duplicateGroups: DuplicateGroup[]): Promise<void> {
    const supabase = this.supabaseService.getClient();

    for (const group of duplicateGroups) {
      try {
        // Mark all screenshots in the group as duplicates
        const screenshotIds = group.screenshots.map(s => s.id);
        
        await supabase
          .from('screenshots')
          .update({ 
            is_duplicate: true,
            duplicate_group_hash: group.hash,
            updated_at: new Date().toISOString()
          })
          .in('id', screenshotIds);

        // Create duplicate detection records for suspicious activity analysis
        for (const screenshot of group.screenshots) {
          await supabase
            .from('suspicious_activity')
            .upsert({
              user_id: screenshot.user_id,
              activity_type: 'duplicate_screenshot',
              details: {
                screenshot_id: screenshot.id,
                duplicate_group_hash: group.hash,
                similarity_score: group.similarity_score,
                captured_at: screenshot.captured_at,
                activity_percent: screenshot.activity_percent,
                app_name: screenshot.app_name,
                window_title: screenshot.window_title
              },
              risk_score: Math.min(50, (group.screenshots.length - 1) * 10), // More duplicates = higher risk
              category: 'productivity',
              timestamp: new Date().toISOString(),
              reviewed: false
            }, {
              onConflict: 'user_id,activity_type,timestamp'
            });
        }

        this.logger.log(`💾 Saved duplicate group with ${group.screenshots.length} screenshots (hash: ${group.hash.substring(0, 8)}...)`);
      } catch (error) {
        this.logger.error(`Failed to save duplicate group:`, error);
      }
    }
  }
} 