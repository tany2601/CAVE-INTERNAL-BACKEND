import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { WhatsappModule } from '../../whatsapp/whatsapp.module.js';

@Module({
  imports: [PrismaModule, ConfigModule, WhatsappModule],
  controllers: [SessionsController],
  providers: [SessionsService, JwtAuthGuard, RolesGuard],
  exports: [SessionsService],
})
export class SessionsModule {}
