import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { ImageService } from './image.service';
import { PubSubService } from './pubsub.service';
import { S3Service } from './s3.service';

@Module({
  imports: [ConfigModule],
  providers: [SupabaseService, ImageService, PubSubService, S3Service],
  exports: [SupabaseService, ImageService, PubSubService, S3Service],
})
export class CommonModule {} 