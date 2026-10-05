import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../../supabase/supabase.service.js';

const BUCKET = 'cave-media';
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class AdminUploadsService {
  private bucketReady = false;

  constructor(private readonly supabase: SupabaseService) {}

  private async ensureBucket() {
    if (this.bucketReady) return;
    const storage = this.supabase.getClient().storage;
    const { data } = await storage.getBucket(BUCKET);
    if (!data) {
      const { error } = await storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: Object.keys(ALLOWED),
      });
      if (error && !/already exists/i.test(error.message)) {
        throw new InternalServerErrorException(`Could not prepare image storage: ${error.message}`);
      }
    }
    this.bucketReady = true;
  }

  /** Uploads an image to Supabase Storage and returns its public URL. */
  async uploadImage(
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    folder: 'staff' | 'branches' | 'products',
  ) {
    if (!file) throw new BadRequestException('An image file is required (field "file").');
    const ext = ALLOWED[file.mimetype];
    if (!ext) throw new BadRequestException('Only JPG, PNG or WebP images are allowed.');
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller.');
    }

    await this.ensureBucket();
    const path = `${folder}/${randomUUID()}.${ext}`;
    const storage = this.supabase.getClient().storage.from(BUCKET);
    const { error } = await storage.upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) throw new InternalServerErrorException(`Image upload failed: ${error.message}`);
    return { url: storage.getPublicUrl(path).data.publicUrl, path };
  }
}
