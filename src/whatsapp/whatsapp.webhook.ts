import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhatsappClient } from './whatsapp.client.js';
import { classifyError, isProgress, readReply } from './whatsapp.policy.js';
import { WhatsappSettings } from './whatsapp.settings.js';
import { WhatsappSuppression } from './whatsapp.suppression.js';

/** Constant-time string comparison that is safe for different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

interface WebhookStatus {
  id?: string;
  status?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}
interface WebhookMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
}
export interface WebhookPayload {
  object?: string;
  entry?: { changes?: { field?: string; value?: { statuses?: WebhookStatus[]; messages?: WebhookMessage[] } }[] }[];
}

/**
 * What WhatsApp tells us after the fact: delivery receipts for messages we sent, and replies from customers
 * (STOP / START). Everything here is safe to run twice with the same event, because WhatsApp retries.
 */
@Injectable()
export class WhatsappWebhook {
  private readonly logger = new Logger('WhatsApp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: WhatsappClient,
    private readonly suppression: WhatsappSuppression,
    private readonly settings: WhatsappSettings,
  ) {}

  /** Webhook messages are signed with the Meta app secret; without it nothing can be trusted. */
  get secretConfigured(): boolean {
    return !!this.config.get<string>('WHATSAPP_APP_SECRET');
  }

  get verifyTokenConfigured(): boolean {
    return !!this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
  }

  /** The one-time handshake when the webhook is set up in the Meta dashboard. */
  verifyHandshake(mode?: string, token?: string): boolean {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    return mode === 'subscribe' && !!expected && !!token && safeEqual(token, expected);
  }

  /** True only for a body that Meta signed with our app secret (X-Hub-Signature-256: sha256=<hex>). */
  validSignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqual(header.slice('sha256='.length), expected);
  }

  async handle(payload: WebhookPayload): Promise<{ statuses: number; replies: number }> {
    let statuses = 0;
    let replies = 0;
    if (payload?.object !== 'whatsapp_business_account') return { statuses, replies };
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        for (const s of change.value?.statuses ?? []) {
          if (await this.onStatus(s)) statuses += 1;
        }
        for (const m of change.value?.messages ?? []) {
          if (await this.onReply(m)) replies += 1;
        }
      }
    }
    return { statuses, replies };
  }

  /** A delivery receipt: sent → delivered → read, or failed after WhatsApp had accepted it. */
  private async onStatus(s: WebhookStatus): Promise<boolean> {
    if (!s.id || !s.status) return false;
    const msg = await this.prisma.whatsappMessage.findFirst({ where: { providerMessageId: s.id } });
    if (!msg) return false; // not ours (or sent by someone else on this number)
    const now = new Date();

    if (s.status === 'failed') {
      const err = s.errors?.[0];
      const policy = classifyError(err?.code, 400);
      await this.prisma.whatsappMessage.update({
        where: { id: msg.id },
        data: {
          status: WhatsappStatus.FAILED,
          deliveryStatus: 'failed',
          lastError: (err?.message ?? err?.title ?? 'WhatsApp could not deliver this message.').slice(0, 500),
          errorCode: err?.code ?? null,
          attempts: 99,
        },
      });
      if (policy.suppress) await this.suppression.add(msg.to, policy.suppress);
      if (policy.pause) await this.settings.pause(policy.pause.scope, policy.pause.minutes, policy.pause.reason);
      return true;
    }

    if (!isProgress(msg.deliveryStatus, s.status)) return true; // out of order or repeated: nothing to change
    await this.prisma.whatsappMessage.update({
      where: { id: msg.id },
      data: {
        deliveryStatus: s.status,
        ...(s.status === 'delivered' || s.status === 'read' ? { deliveredAt: msg.deliveredAt ?? now } : {}),
        ...(s.status === 'read' ? { readAt: now } : {}),
      },
    });
    return true;
  }

  /** A customer wrote to us. Only "stop" and "start" mean anything; everything else is left to the staff app. */
  private async onReply(m: WebhookMessage): Promise<boolean> {
    const from = (m.from ?? '').replace(/\D/g, '');
    if (!from) return false;
    const text = m.type === 'button' ? m.button?.text : m.text?.body;
    const intent = readReply(text);
    if (!intent) return false;
    if (intent === 'stop') {
      const added = await this.suppression.add(from, 'STOP');
      if (added) {
        await this.client.sendText(from, "You won't get offers from CAVE any more. You'll still get your bills. Reply START any time to receive offers again.");
      }
    } else if (await this.suppression.lift(from)) {
      await this.client.sendText(from, 'Welcome back! You will get CAVE offers again. Reply STOP any time to opt out.');
    }
    return true;
  }
}
