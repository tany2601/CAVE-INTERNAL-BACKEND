import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { BranchOpsController } from './branch.controller.js';
import { BranchOpsService } from './branch.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

@Module({
  imports: [PrismaModule, ConfigModule, SessionsModule],
  controllers: [BranchOpsController],
  providers: [BranchOpsService, JwtAuthGuard, RolesGuard],
})
export class BranchOpsModule {}
