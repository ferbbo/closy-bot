import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { ImageProcessorService } from './image/image-processor.service';
import { ImageValidatorService } from './image/image-validator.service';

/**
 * StorageModule — provides R2 storage + image processing/validation services.
 *
 * Import this module wherever file upload/delete is needed.
 * Exports all three services for use in feature modules.
 */
@Module({
  imports: [ConfigModule],
  providers: [StorageService, ImageProcessorService, ImageValidatorService],
  exports: [StorageService, ImageProcessorService, ImageValidatorService],
})
export class StorageModule {}
