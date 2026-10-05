import { Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TokenRefreshService } from './token-refresh.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@ApiTags('Authentication')
@Controller('auth')
export class TokenRefreshController {
  constructor(private readonly refreshService: TokenRefreshService) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Renew the current session token',
    description:
      'Exchanges a still-valid branch or admin access token for a fresh 24-hour one with the same claims.',
  })
  refresh(@Req() req: any) {
    return this.refreshService.refresh(req.user);
  }
}
