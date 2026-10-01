import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PinModule } from '../../common/security/pin.module.js';
import { BranchAuthController } from './branch-auth.controller.js';
import { BranchAuthService } from './branch-auth.service.js';

@Module({
  imports: [PrismaModule, PinModule, ConfigModule],
  controllers: [BranchAuthController],
  providers: [BranchAuthService],
  exports: [BranchAuthService],
})
export class BranchAuthModule {}
