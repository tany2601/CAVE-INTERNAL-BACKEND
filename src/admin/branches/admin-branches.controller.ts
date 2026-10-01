import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
import { AdminBranchesService } from './admin-branches.service.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import {
  CreateBranchResponseDto,
  BranchDataDto,
} from './dto/create-branch-response.dto.js';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto.js';
import { ListBranchesResponseDto } from './dto/list-branches-response.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';
import { UpdateBranchStatusDto } from './dto/update-branch-status.dto.js';
import { SetRolePinDto } from './dto/set-role-pin.dto.js';
import { GetRolePinsResponseDto } from './dto/get-role-pins-response.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Branches')
@Controller('admin/branches')
export class AdminBranchesController {
  constructor(private readonly adminBranchesService: AdminBranchesService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get branch details by ID' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch retrieved successfully',
    type: BranchDataDto,
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
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async getBranchById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminBranchesService.getBranchById(id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all branches with pagination and filters' })
  @ApiResponse({
    status: 200,
    description: 'Branches retrieved successfully',
    type: ListBranchesResponseDto,
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
  async listBranches(@Query() query: ListBranchesQueryDto) {
    return this.adminBranchesService.listBranches(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new branch' })
  @ApiResponse({
    status: 201,
    description: 'Branch created successfully',
    type: CreateBranchResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
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
    description: 'Branch name or code already exists',
  })
  async createBranch(@Body() dto: CreateBranchDto) {
    return this.adminBranchesService.createBranch(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update branch details' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the branch to update',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Branch updated successfully' },
        branch: { $ref: '#/components/schemas/BranchDataDto' },
      },
    },
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
  @ApiResponse({ status: 404, description: 'Branch not found' })
  @ApiResponse({
    status: 409,
    description: 'Branch name or code already exists',
  })
  async updateBranch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.adminBranchesService.updateBranch(id, dto);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate or deactivate a branch' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch status updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Branch status updated successfully',
        },
        branch: { $ref: '#/components/schemas/BranchDataDto' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID or boolean input' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async updateBranchStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBranchStatusDto,
  ) {
    return this.adminBranchesService.updateBranchStatus(id, dto);
  }

  @Put(':branchId/role-pins/:roleName')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set or update a role-specific branch PIN' })
  @ApiParam({
    name: 'branchId',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiParam({
    name: 'roleName',
    description: 'Role name (MANAGER or STYLIST)',
    example: 'MANAGER',
  })
  @ApiResponse({
    status: 200,
    description: 'Role PIN configured successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid PIN format, invalid role name, or inactive branch/role',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  @ApiResponse({
    status: 409,
    description: 'PIN is already assigned to another branch or role',
  })
  async setRolePin(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Param('roleName') roleName: string,
    @Body() dto: SetRolePinDto,
  ) {
    return this.adminBranchesService.setRolePin(branchId, roleName, dto);
  }

  @Get(':branchId/role-pins')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get configured role PIN status for a branch' })
  @ApiParam({
    name: 'branchId',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Role PIN configuration status retrieved successfully',
    type: GetRolePinsResponseDto,
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
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async getRolePinsStatus(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
  ) {
    return this.adminBranchesService.getRolePinsStatus(branchId);
  }

  @Delete(':branchId/role-pins/:roleName')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset or delete a role PIN for a branch' })
  @ApiParam({
    name: 'branchId',
    description: 'UUID of the branch',
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiParam({
    name: 'roleName',
    description: 'Role name (MANAGER or STYLIST)',
    example: 'MANAGER',
  })
  @ApiResponse({
    status: 200,
    description: 'Role PIN deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid role name or UUID format' })
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
    description: 'Branch or role PIN credential not found',
  })
  async resetRolePin(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Param('roleName') roleName: string,
  ) {
    return this.adminBranchesService.resetRolePin(branchId, roleName);
  }
}
