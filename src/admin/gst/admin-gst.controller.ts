import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { GST_MODES, GstMode, isValidGstin } from '../../common/gst.js';
import { GstSettings } from '../../common/gst-settings.service.js';
import { SaveBranchGstDto, SaveGstDto } from './dto/save-gst.dto.js';

/** Every mode must be one of the three; anything else is a mistake and is refused. */
function checkModes(modes: Record<string, GstMode>): Record<string, GstMode> {
  for (const [id, mode] of Object.entries(modes ?? {})) {
    if (typeof id !== 'string' || id.length > 64 || !GST_MODES.includes(mode)) {
      throw new BadRequestException('Each service must be + GST (ADD_ON_TOP), Incl. GST (INCLUDED_IN_PRICE) or No GST (NO_GST).');
    }
  }
  return modes ?? {};
}

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

  @Get('branches')
  @ApiOperation({ summary: 'Every branch with its own GST switch, rates and services (or the defaults it follows)' })
  async listBranches() {
    return { data: await this.gst.listBranches() };
  }

  @Put('branches/:branchId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set one branch's GST switch, rates and which services include GST" })
  async saveBranch(@Param('branchId', new ParseUUIDPipe()) branchId: string, @Body() dto: SaveBranchGstDto) {
    await this.gst.saveBranch(branchId, { ...dto, serviceModes: checkModes(dto.serviceModes) });
    return { data: (await this.gst.listBranches()).find((b) => b.branchId === branchId) };
  }

  @Delete('branches/:branchId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put a branch back on the business GST defaults' })
  async resetBranch(@Param('branchId', new ParseUUIDPipe()) branchId: string) {
    await this.gst.resetBranch(branchId);
    return { data: (await this.gst.listBranches()).find((b) => b.branchId === branchId) };
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
      serviceModes: checkModes(dto.serviceModes),
      servicesCode: dto.servicesCode ?? '',
      productsCode: dto.productsCode ?? '',
    });
  }
}
