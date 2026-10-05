import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PinModule } from '../../common/security/pin.module.js';
import { BranchAuthController } from './branch-auth.controller.js';
import { BranchAuthService } from './branch-auth.service.js';
import { TokenRefreshController } from '../refresh/token-refresh.controller.js';
import { TokenRefreshService } from '../refresh/token-refresh.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Module({
  imports: [PrismaModule, PinModule, ConfigModule],
  controllers: [BranchAuthController, TokenRefreshController],
  providers: [BranchAuthService, TokenRefreshService, JwtAuthGuard],
  exports: [BranchAuthService],
})
export class BranchAuthModule {}
