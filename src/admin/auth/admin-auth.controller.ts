import {
  Controller,
  Post,
  Patch,
  Body,
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
import { AdminAuthService } from './admin-auth.service.js';
import { SetupAdminDto } from './dto/setup-admin.dto.js';
import { ChangeAdminPinDto } from './dto/change-admin-pin.dto.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Admin Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login using PIN-only authentication' })
  @ApiResponse({
    status: 200,
    description: 'Admin PIN login successful',
    schema: {
      type: 'object',
      properties: {
        accessToken: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input or PIN format' })
  @ApiResponse({
    status: 401,
    description: 'Invalid PIN or admin account not found',
  })
  async login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Post('pin/setup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Setup initial global Admin account and PIN' })
  @ApiResponse({
    status: 201,
    description: 'Admin account created successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Admin account created successfully' },
        admin: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '12c9bc67-4306-4039-9eea-fe856360e1cf' },
            name: { type: 'string', example: 'CAVE Admin' },
            email: { type: 'string', example: 'admin@cave.com' },
            role: { type: 'string', example: 'ADMIN' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Admin account already exists' })
  async setupAdmin(@Body() dto: SetupAdminDto) {
    return this.adminAuthService.setupAdmin(dto);
  }

  @Patch('pin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change logged-in Admin PIN' })
  @ApiResponse({
    status: 200,
    description: 'Admin PIN changed successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Admin PIN changed successfully',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid PIN format' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT, or incorrect current PIN',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user is not an ADMIN',
  })
  @ApiResponse({
    status: 500,
    description: 'Unexpected errors, without exposing internal details',
  })
  async changePin(
    @CurrentUser('id') adminId: string,
    @Body() dto: ChangeAdminPinDto,
  ) {
    return this.adminAuthService.changePin(adminId, dto);
  }
}
