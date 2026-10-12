import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { WhatsappModule } from '../whatsapp/whatsapp.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { TtsService } from './tts.service.js';

@Module({
  imports: [ConfigModule, WhatsappModule],
  controllers: [AssistantController],
  providers: [AssistantService, TtsService, JwtAuthGuard, RolesGuard],
})
export class AssistantModule {}
