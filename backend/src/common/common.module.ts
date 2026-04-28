import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { ImageService } from './image.service';
import { PubSubService } from './pubsub.service';

@Module({
  imports: [ConfigModule],
  providers: [SupabaseService, ImageService, PubSubService],
  exports: [SupabaseService, ImageService, PubSubService],
})
export class CommonModule {} 