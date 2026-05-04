import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
@Processor('ai-analysis')
export class AiScreenshotAnalyzerProcessor {
  private readonly logger = new Logger(AiScreenshotAnalyzerProcessor.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  @Process('analyze-screenshot')
  async analyzeScreenshot(job: Job) {
    try {
      const screenshot_id = job.data?.screenshot_id ?? job.data?.screenshotId;
      if (!screenshot_id) {
        this.logger.error('Missing screenshot_id in job payload', job.data);
        throw new Error('screenshot_id is required (use screenshot_id or screenshotId)');
      }
      this.logger.log(`🤖 Starting AI analysis for screenshot: ${screenshot_id}`);

      const supabase = this.supabaseService.getClient();

      // Call the screenshot analyzer edge function for single analysis
      const { data, error } = await supabase.functions.invoke('ai-screenshot-analyzer', {
        body: {
          screenshot_id,
          use_ai: true,
          generate_description: true,
          ...(typeof job.data?.visual_scene_transcript === 'string'
            ? { visual_scene_transcript: job.data.visual_scene_transcript }
            : {}),
          ...(typeof job.data?.screenshot_intelligence_text_mode === 'string'
            ? { screenshot_intelligence_text_mode: job.data.screenshot_intelligence_text_mode }
            : {}),
        },
      });

      if (error) {
        this.logger.error(`AI analysis failed for screenshot ${screenshot_id}:`, error);
        throw error;
      }

      this.logger.log(`✅ AI analysis completed for screenshot ${screenshot_id}: ${data?.message}`);
      return data;

    } catch (error) {
      this.logger.error('AI screenshot analysis failed:', error);
      throw error;
    }
  }

  @Process('analyze-batch')
  async analyzeBatch(job: Job) {
    try {
      this.logger.log('🤖 Starting batch AI analysis for pending screenshots');

      const supabase = this.supabaseService.getClient();

      // Call the session analyst edge function in batch mode
      const { data, error } = await supabase.functions.invoke('ai-session-analyst', {
        body: { action: 'process', limit: 50 },
      });

      if (error) {
        this.logger.error('Batch AI analysis failed:', error);
        throw error;
      }

      this.logger.log(`✅ Batch AI analysis completed: ${data?.message} (${data?.analyzed_count} screenshots)`);
      return data;

    } catch (error) {
      this.logger.error('Batch AI analysis failed:', error);
      throw error;
    }
  }

  @Process('reanalyze-screenshot')
  async reanalyzeScreenshot(job: Job) {
    try {
      const screenshot_id = job.data?.screenshot_id ?? job.data?.screenshotId;
      const { reason } = job.data;
      if (!screenshot_id) {
        this.logger.error('Missing screenshot_id in reanalyze job payload', job.data);
        throw new Error('screenshot_id is required (use screenshot_id or screenshotId)');
      }
      this.logger.log(`🔄 Re-analyzing screenshot ${screenshot_id}, reason: ${reason}`);

      const supabase = this.supabaseService.getClient();

      // Mark screenshot for re-analysis
      const { error: markError } = await supabase
        .rpc('mark_screenshot_for_reanalysis', { screenshot_id });

      if (markError) {
        this.logger.error(`Failed to mark screenshot for re-analysis:`, markError);
        throw markError;
      }

      // Trigger re-analysis
      const { data, error } = await supabase.functions.invoke('ai-screenshot-analyzer', {
        body: {
          screenshot_id,
          use_ai: true,
          generate_description: true,
          force_ai: true,
          force_vision: true,
          ...(typeof job.data?.visual_scene_transcript === 'string'
            ? { visual_scene_transcript: job.data.visual_scene_transcript }
            : {}),
          ...(typeof job.data?.screenshot_intelligence_text_mode === 'string'
            ? { screenshot_intelligence_text_mode: job.data.screenshot_intelligence_text_mode }
            : {}),
        },
      });

      if (error) {
        this.logger.error(`Re-analysis failed for screenshot ${screenshot_id}:`, error);
        throw error;
      }

      this.logger.log(`✅ Re-analysis completed for screenshot ${screenshot_id}: ${data?.message}`);
      return data;

    } catch (error) {
      this.logger.error('Screenshot re-analysis failed:', error);
      throw error;
    }
  }
} 