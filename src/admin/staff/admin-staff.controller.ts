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
import { AdminStaffService } from './admin-staff.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import {
  CreateStaffResponseDto,
  StaffDataDto,
} from './dto/create-staff-response.dto.js';
import { ListStaffQueryDto } from './dto/list-staff-query.dto.js';
import { ListStaffResponseDto } from './dto/list-staff-response.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Staff')
@Controller('admin/staff')
export class AdminStaffController {
  constructor(private readonly adminStaffService: AdminStaffService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new staff member' })
  @ApiResponse({
    status: 201,
    description: 'Staff member created successfully',
    type: CreateStaffResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input, inactive role/branch, or attempt to assign ADMIN role',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  async createStaff(@Body() dto: CreateStaffDto) {
    return this.adminStaffService.createStaff(dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List staff members with pagination and filters' })
  @ApiResponse({
    status: 200,
    description: 'Staff members retrieved successfully',
    type: ListStaffResponseDto,
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
  async listStaff(@Query() query: ListStaffQueryDto) {
    return this.adminStaffService.listStaff(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff member details by ID' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the staff member',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff member retrieved successfully',
    type: StaffDataDto,
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
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async getStaffById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminStaffService.getStaffById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update staff member details' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the staff member to update',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff member updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Staff member updated successfully',
        },
        staff: { $ref: '#/components/schemas/StaffDataDto' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input, inactive role/branch, or attempt to assign ADMIN role',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async updateStaff(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.adminStaffService.updateStaff(id, dto);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate or deactivate a staff member' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the staff member',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff member status updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Staff member status updated successfully',
        },
        staff: { $ref: '#/components/schemas/StaffDataDto' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid UUID format, boolean input, or attempt to modify Admin account status',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async updateStaffStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.adminStaffService.updateStaffStatus(id, dto);
  }
}
