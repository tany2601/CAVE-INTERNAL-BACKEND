import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ReportExport } from './report-export.js';
import { WhatsappClient } from './whatsapp.client.js';
import { WhatsappController } from './whatsapp.controller.js';
import { WhatsappSuppression } from './whatsapp.suppression.js';
import { WhatsappWebhook } from './whatsapp.webhook.js';
import { WhatsappWebhookController } from './whatsapp.webhook.controller.js';
import { WhatsappOffers } from './whatsapp.offers.js';
import { WhatsappOutbox } from './whatsapp.outbox.js';
import { WhatsappReports } from './whatsapp.reports.js';
import { WhatsappService } from './whatsapp.service.js';
import { WhatsappSettings } from './whatsapp.settings.js';

@Module({
  imports: [ConfigModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappSuppression, WhatsappWebhook, ReportExport, WhatsappClient, WhatsappOutbox, WhatsappSettings, WhatsappOffers, WhatsappReports, WhatsappService, JwtAuthGuard, RolesGuard],
  exports: [WhatsappService, WhatsappSettings, ReportExport],
})
export class WhatsappModule {}
