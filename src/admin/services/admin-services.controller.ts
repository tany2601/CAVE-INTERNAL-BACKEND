import {
  Controller,
  Post,
  Get,
  Patch,
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
import { AdminServicesService } from './admin-services.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { UpdateServiceStatusDto } from './dto/update-service-status.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Services')
@Controller('admin/services')
export class AdminServicesController {
  constructor(private readonly adminServicesService: AdminServicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new global service' })
  @ApiResponse({
    status: 201,
    description: 'Service created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input payload' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({
    status: 409,
    description: 'Service with this name already exists',
  })
  async createService(@Body() dto: CreateServiceDto) {
    return this.adminServicesService.createService(dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all global services with pagination and search' })
  @ApiResponse({
    status: 200,
    description: 'Services retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  async listServices(@Query() query: ListServicesQueryDto) {
    return this.adminServicesService.listServices(query);
  }

  @Get(':serviceId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get global service details by ID' })
  @ApiParam({
    name: 'serviceId',
    description: 'UUID of the service',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Service retrieved successfully',
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
  @ApiResponse({ status: 404, description: 'Service not found' })
  async getServiceById(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
  ) {
    return this.adminServicesService.getServiceById(serviceId);
  }

  @Patch(':serviceId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update global service details' })
  @ApiParam({
    name: 'serviceId',
    description: 'UUID of the service to update',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Service updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or payload' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Service not found' })
  @ApiResponse({
    status: 409,
    description: 'Service with this name already exists',
  })
  async updateService(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.adminServicesService.updateService(serviceId, dto);
  }

  @Patch(':serviceId/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate or deactivate a global service' })
  @ApiParam({
    name: 'serviceId',
    description: 'UUID of the service',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Service status updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or boolean value' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async updateServiceStatus(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() dto: UpdateServiceStatusDto,
  ) {
    return this.adminServicesService.updateServiceStatus(serviceId, dto);
  }
}
