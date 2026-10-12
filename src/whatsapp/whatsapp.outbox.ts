import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WhatsappKind, WhatsappStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TemplateHeader, WhatsappClient, WhatsappSendError } from './whatsapp.client.js';
import { classifyError } from './whatsapp.policy.js';
import { WhatsappSettings } from './whatsapp.settings.js';
import { WhatsappSuppression } from './whatsapp.suppression.js';

/** Minutes to wait after the 1st, 2nd, 3rd… failed attempt. After the last one the message is given up on. */
export const RETRY_MINUTES = [1, 5, 15, 60, 180];

/** A row is "claimed" by one process for this long while it is being sent. */
const LOCK_MS = 2 * 60_000;
/** Pause between offers so a broadcast trickles out (about 2 a second) instead of arriving as a burst. */
const OFFER_GAP_MS = 400;
export const DEFAULT_OFFER_DAILY_LIMIT = 200;

export interface OutgoingMessage {
  kind: WhatsappKind;
  /** Anything unique for this message; sending the same key twice only ever sends once. */
  dedupeKey: string;
  to: string;
  template: string;
  params: string[];
  /** Picture or document shown above the message (template must have a matching header). */
  header?: TemplateHeader;
  sessionId?: string;
  offerId?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Every WhatsApp message is saved first and sent from here, so a slow or failing WhatsApp never
 * holds up billing, failures are retried instead of lost, and nothing is ever sent twice.
 *
 * Safety rails: a row is claimed before sending (two server processes can't both send it), opted-out
 * and undeliverable numbers are skipped, offers trickle out under a daily limit, and account-level
 * errors from WhatsApp pause sending instead of hammering it.
 */
@Injectable()
export class WhatsappOutbox implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsApp');
  private timer?: NodeJS.Timeout;
  private flushing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly settings: WhatsappSettings,
    private readonly suppression: WhatsappSuppression,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Most offers WhatsApp may be asked to deliver in any 24 hours. */
  get offerDailyLimit(): number {
    const v = Number(this.config.get<string>('WHATSAPP_OFFER_DAILY_LIMIT'));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_OFFER_DAILY_LIMIT;
  }

  /** Offers WhatsApp accepted in the last 24 hours (what the daily limit counts). */
  offersSentInLastDay(): Promise<number> {
    return this.prisma.whatsappMessage.count({
      where: { kind: WhatsappKind.OFFER, status: WhatsappStatus.SENT, sentAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    });
  }

  /** Offers already sent or waiting to be sent in the last 24 hours. */
  async offersInLastDay(): Promise<number> {
    return this.prisma.whatsappMessage.count({
      where: {
        kind: WhatsappKind.OFFER,
        status: { in: [WhatsappStatus.SENT, WhatsappStatus.PENDING] },
        createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
    });
  }

  /** Saves a message to be sent. Returns false when it was skipped (not configured, blocked number, or already queued/sent). */
  async enqueue(msg: OutgoingMessage): Promise<boolean> {
    if (!this.client.isConfigured()) return false;
    if (await this.suppression.isBlocked(msg.to, msg.kind)) return false;
    try {
      await this.prisma.whatsappMessage.create({
        data: {
          dedupeKey: msg.dedupeKey,
          kind: msg.kind,
          to: msg.to,
          template: msg.template,
          params: msg.params as unknown as Prisma.InputJsonValue,
          sessionId: msg.sessionId ?? null,
          offerId: msg.offerId ?? null,
          header: (msg.header ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false; // already queued or sent
      throw e;
    }
    void this.flush();
    return true;
  }

  /**
   * Puts messages that gave up (for example because a template was not approved yet) back in the queue.
   * Only the last 24 hours, so an old bill is never sent days late. Returns how many were requeued.
   */
  async retryFailed(): Promise<number> {
    const res = await this.prisma.whatsappMessage.updateMany({
      where: { status: WhatsappStatus.FAILED, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      data: { status: WhatsappStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lastError: null, errorCode: null },
    });
    if (res.count > 0) void this.flush();
    return res.count;
  }

  /** Sends everything that is due. Safe to call at any time; overlapping calls are ignored. */
  async flush(): Promise<number> {
    if (this.flushing || !this.client.isConfigured()) return 0;
    this.flushing = true;
    let sent = 0;
    try {
      let pause = await this.settings.getPause();
      if (pause.all) return 0;
      let skipOffers = !!pause.offers;
      let offersLeft = skipOffers ? 0 : Math.max(0, this.offerDailyLimit - (await this.offersSentInLastDay()));

      // Large broadcasts take many rounds; keep going until nothing is due, within a sane cap.
      for (let round = 0; round < 20; round += 1) {
        const now = new Date();
        const due = await this.prisma.whatsappMessage.findMany({
          where: {
            status: { in: [WhatsappStatus.PENDING, WhatsappStatus.FAILED] },
            attempts: { lt: RETRY_MINUTES.length + 1 },
            nextAttemptAt: { lte: now },
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            ...(skipOffers || offersLeft <= 0 ? { kind: { not: WhatsappKind.OFFER } } : {}),
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
        });
        if (due.length === 0) break;
        let worked = false;
        for (const m of due) {
          if (pause.all) break;
          if (m.kind === WhatsappKind.OFFER && (skipOffers || offersLeft <= 0)) continue;

          // Claim the row. If another process got there first (or it was just updated) leave it alone.
          const claim = await this.prisma.whatsappMessage.updateMany({
            where: {
              id: m.id,
              attempts: m.attempts,
              status: { in: [WhatsappStatus.PENDING, WhatsappStatus.FAILED] },
              OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
            },
            data: { lockedUntil: new Date(Date.now() + LOCK_MS) },
          });
          if (claim.count !== 1) continue;
          worked = true;

          // The number may have opted out or been found undeliverable since this was queued.
          if (await this.suppression.isBlocked(m.to, m.kind)) {
            await this.prisma.whatsappMessage.update({
              where: { id: m.id },
              data: {
                status: WhatsappStatus.FAILED,
                attempts: RETRY_MINUTES.length + 1,
                lastError: 'Skipped: this number opted out or cannot receive WhatsApp messages.',
                lockedUntil: null,
              },
            });
            continue;
          }

          const attempts = m.attempts + 1;
          try {
            const res = await this.client.sendTemplate(m.to, m.template, m.params as unknown as string[], m.header as TemplateHeader | null);
            await this.prisma.whatsappMessage.update({
              where: { id: m.id },
              data: {
                status: WhatsappStatus.SENT,
                attempts,
                sentAt: new Date(),
                providerMessageId: res.id,
                lastError: null,
                errorCode: null,
                lockedUntil: null,
              },
            });
            sent += 1;
            if (m.kind === WhatsappKind.OFFER) {
              offersLeft -= 1;
              await sleep(OFFER_GAP_MS);
            }
          } catch (e) {
            const err = e instanceof WhatsappSendError ? e : new WhatsappSendError((e as Error).message, true);
            // No status code here (the client already folded it into err.retryable): 500 = retry-worthy, 400 = not.
            const policy = classifyError(err.code, err.retryable ? 500 : 400);
            let retryable = err.retryable || policy.retryable;
            let waitMs = RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)] * 60_000;
            if (policy.pause) {
              // The problem is the account, not this message: stop everything (or just offers) for a while.
              await this.settings.pause(policy.pause.scope, policy.pause.minutes, policy.pause.reason);
              this.logger.error(`Sending paused (${policy.pause.scope}) for ${policy.pause.minutes} min: ${policy.pause.reason}`);
              pause = await this.settings.getPause();
              if (policy.pause.scope === 'offers') skipOffers = true;
              if (policy.pause.scope === 'all') retryable = true; // keep the message for after the pause
              waitMs = Math.max(waitMs, policy.pause.minutes * 60_000);
            }
            if (policy.suppress) await this.suppression.add(m.to, policy.suppress);
            const giveUp = !retryable || attempts > RETRY_MINUTES.length;
            await this.prisma.whatsappMessage.update({
              where: { id: m.id },
              data: {
                status: WhatsappStatus.FAILED,
                attempts: giveUp ? RETRY_MINUTES.length + 1 : attempts,
                lastError: err.message.slice(0, 500),
                errorCode: err.code ?? null,
                nextAttemptAt: new Date(Date.now() + waitMs),
                lockedUntil: null,
              },
            });
            // WhatsApp declining several marketing messages in a row means people are not engaging: ease off.
            if (m.kind === WhatsappKind.OFFER && err.code === 131049) {
              const recent = await this.prisma.whatsappMessage.count({
                where: { kind: WhatsappKind.OFFER, errorCode: 131049, createdAt: { gte: new Date(Date.now() - 3600_000) } },
              });
              if (recent >= 3) {
                await this.settings.pause('offers', 12 * 60, 'WhatsApp is declining offers to protect customers. Offers are paused for 12 hours; try a more relevant offer later.');
                skipOffers = true;
              }
            }
          }
        }
        if (!worked) break;
      }
    } catch (e) {
      this.logger.error(`Outbox flush failed: ${(e as Error).message}`);
    } finally {
      this.flushing = false;
    }
    return sent;
  }
}
