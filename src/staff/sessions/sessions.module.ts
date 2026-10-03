import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SessionsController],
  providers: [SessionsService, JwtAuthGuard, RolesGuard],
  exports: [SessionsService],
})
export class SessionsModule {}
