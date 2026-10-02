import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminMenuPricingService } from './admin-menu-pricing.service.js';
import { CreateBranchPricingDto } from './dto/create-branch-pricing.dto.js';
import { UpdateBranchPricingDto } from './dto/update-branch-pricing.dto.js';
import { ListBranchPricingQueryDto } from './dto/list-branch-pricing-query.dto.js';
import { BulkMenuPricingDto } from './dto/bulk-menu-pricing.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Menu Pricing')
@Controller('admin')
export class AdminMenuPricingController {
  constructor(
    private readonly adminMenuPricingService: AdminMenuPricingService,
  ) {}

  @Get('branches/:branchId/menu-pricing')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List menu pricing for a specific branch' })
  @ApiParam({
    name: 'branchId',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch menu pricing retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async listBranchPricing(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Query() query: ListBranchPricingQueryDto,
  ) {
    return this.adminMenuPricingService.listBranchPricing(branchId, query);
  }

  @Post('branches/:branchId/menu-pricing')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create menu pricing for a branch-service combination' })
  @ApiParam({
    name: 'branchId',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 201,
    description: 'Branch menu pricing created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or branch/service is inactive',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Branch or service not found' })
  @ApiResponse({
    status: 409,
    description: 'Branch menu pricing already exists for this service',
  })
  async createBranchPricing(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Body() dto: CreateBranchPricingDto,
  ) {
    return this.adminMenuPricingService.createBranchPricing(branchId, dto);
  }

  @Patch('branches/:branchId/menu-pricing/:pricingId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update price or active status of a branch menu pricing' })
  @ApiParam({
    name: 'branchId',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiParam({
    name: 'pricingId',
    description: 'UUID of the branch pricing record',
    example: 'c1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch menu pricing updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or input' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({
    status: 404,
    description: 'Branch or menu pricing record not found',
  })
  async updateBranchPricing(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Param('pricingId', new ParseUUIDPipe()) pricingId: string,
    @Body() dto: UpdateBranchPricingDto,
  ) {
    return this.adminMenuPricingService.updateBranchPricing(
      branchId,
      pricingId,
      dto,
    );
  }

  @Delete('branches/:branchId/menu-pricing/:pricingId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a branch menu pricing record' })
  @ApiParam({
    name: 'branchId',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiParam({
    name: 'pricingId',
    description: 'UUID of the branch pricing record',
    example: 'c1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch menu pricing deactivated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({
    status: 404,
    description: 'Branch or menu pricing record not found',
  })
  async deactivateBranchPricing(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Param('pricingId', new ParseUUIDPipe()) pricingId: string,
  ) {
    return this.adminMenuPricingService.deactivateBranchPricing(
      branchId,
      pricingId,
    );
  }

  @Post('menu-pricing/bulk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk assign pricing across branches and services in a transaction' })
  @ApiResponse({
    status: 200,
    description: 'Bulk menu pricing configured successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input, duplicate entries in payload, or inactive branch/service',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({
    status: 404,
    description: 'One or more branches/services not found',
  })
  async configureBulkPricing(@Body() dto: BulkMenuPricingDto) {
    return this.adminMenuPricingService.configureBulkPricing(dto);
  }
}
