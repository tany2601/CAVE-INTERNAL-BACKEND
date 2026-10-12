import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { BranchAuthService } from './branch-auth.service.js';
import { BranchLoginDto } from './dto/branch-login.dto.js';

@ApiTags('Branch Authentication')
@Controller('auth/branch')
export class BranchAuthController {
  constructor(private readonly branchAuthService: BranchAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with 4-digit branch role PIN' })
  @ApiResponse({
    status: 200,
    description: 'Branch role login successful',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        branch: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            code: { type: 'string' },
          },
        },
        role: { type: 'string', example: 'MANAGER' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Invalid PIN, inactive branch/role, or unconfigured credential',
  })
  async login(@Body() dto: BranchLoginDto, @Req() req: Request) {
    // req.ip honours `trust proxy` (set in main.ts) so it is the real client behind nginx, and a client
    // cannot choose its own address by sending an X-Forwarded-For header.
    const clientIp = req.ip || req.socket.remoteAddress || 'global';
    return this.branchAuthService.login(dto, clientIp);
  }
}
