import { Injectable, Logger } from '@nestjs/common';
import * as sharp from 'sharp';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  async blurImage(buffer: Buffer, blurAmount = 5): Promise<Buffer> {
    try {
      const blurredBuffer = await sharp(buffer)
        .blur(blurAmount)
        .jpeg({ quality: 80 })
        .toBuffer();

      this.logger.debug(`Image blurred with amount: ${blurAmount}`);
      return blurredBuffer;
    } catch (error) {
      this.logger.error('Failed to blur image:', error);
      throw new Error('Image processing failed');
    }
  }

  async resizeImage(
    buffer: Buffer,
    width?: number,
    height?: number,
    quality = 80,
  ): Promise<Buffer> {
    try {
      let sharpInstance = sharp(buffer);

      if (width || height) {
        sharpInstance = sharpInstance.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const resizedBuffer = await sharpInstance
        .jpeg({ quality })
        .toBuffer();

      this.logger.debug(`Image resized to ${width}x${height}`);
      return resizedBuffer;
    } catch (error) {
      this.logger.error('Failed to resize image:', error);
      throw new Error('Image processing failed');
    }
  }

  async getImageMetadata(buffer: Buffer) {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
      };
    } catch (error) {
      this.logger.error('Failed to get image metadata:', error);
      throw new Error('Image metadata extraction failed');
    }
  }

  async optimizeImage(buffer: Buffer): Promise<Buffer> {
    try {
      const optimizedBuffer = await sharp(buffer)
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      this.logger.debug('Image optimized');
      return optimizedBuffer;
    } catch (error) {
      this.logger.error('Failed to optimize image:', error);
      throw new Error('Image optimization failed');
    }
  }
} 