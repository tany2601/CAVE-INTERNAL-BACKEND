import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Query, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { WhatsappWebhook, WebhookPayload } from './whatsapp.webhook.js';

/**
 * Where WhatsApp sends delivery receipts and customer replies: POST /api/webhooks/whatsapp.
 * Public (WhatsApp has no login), so it trusts nothing that is not signed with the app secret.
 */
@ApiExcludeController()
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly webhook: WhatsappWebhook) {}

  /** Meta calls this once when the webhook is saved in the dashboard, with a challenge to echo back. */
  @Get()
  verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    if (!this.webhook.verifyHandshake(mode, token)) throw new ForbiddenException();
    return String(challenge ?? '');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: Request & { rawBody?: Buffer }) {
    // Fail closed: with no app secret configured, or a missing/forged signature, nothing is processed.
    if (!this.webhook.secretConfigured) throw new ServiceUnavailableException();
    if (!this.webhook.validSignature(req.rawBody, req.get('x-hub-signature-256'))) throw new UnauthorizedException();
    await this.webhook.handle((req.body ?? {}) as WebhookPayload);
    return { ok: true };
  }
}
