import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUploadsService, MAX_IMAGE_BYTES } from './admin-uploads.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/uploads')
export class AdminUploadsController {
  constructor(private readonly uploads: AdminUploadsService) {}

  @Post('image')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a staff or branch photo to Supabase Storage' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  upload(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @Query('folder') folder?: string,
  ) {
    if (folder !== 'staff' && folder !== 'branches' && folder !== 'products') {
      throw new BadRequestException('folder must be "staff", "branches" or "products".');
    }
    return this.uploads.uploadImage(file, folder);
  }
}
