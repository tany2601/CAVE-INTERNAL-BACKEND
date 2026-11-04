import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { isValidGstin } from '../../common/gst.js';
import { GstSettings } from '../../common/gst-settings.service.js';
import { SaveGstDto } from './dto/save-gst.dto.js';

@ApiTags('Admin GST')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/gst')
export class AdminGstController {
  constructor(private readonly gst: GstSettings) {}

  @Get()
  @ApiOperation({ summary: 'GSTIN, rates and whether prices include GST' })
  get() {
    return this.gst.get();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save the GSTIN, the GST rates and whether prices include GST' })
  save(@Body() dto: SaveGstDto) {
    if (!isValidGstin(dto.gstin)) {
      throw new BadRequestException('That GSTIN is not valid. Please check each character.');
    }
    return this.gst.save({
      enabled: dto.enabled,
      gstin: dto.gstin,
      legalName: dto.legalName ?? '',
      services: dto.services,
      products: dto.products,
      inclusiveServiceIds: dto.inclusiveServiceIds,
      servicesCode: dto.servicesCode ?? '',
      productsCode: dto.productsCode ?? '',
    });
  }
}
