import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminRolesService } from './admin-roles.service.js';
import { GetRolesQueryDto } from './dto/get-roles-query.dto.js';
import { GetRolesResponseDto } from './dto/role-response.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Roles')
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active roles for staff assignment' })
  @ApiResponse({
    status: 200,
    description: 'Roles retrieved successfully',
    type: GetRolesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  async getRoles(@Query() query: GetRolesQueryDto) {
    return this.adminRolesService.getRoles(query);
  }
}
