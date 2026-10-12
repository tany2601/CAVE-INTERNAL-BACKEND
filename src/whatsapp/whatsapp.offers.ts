import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { SessionStatus, WhatsappKind, WhatsappStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhatsappClient } from './whatsapp.client.js';
import { WhatsappOutbox } from './whatsapp.outbox.js';
import { WhatsappSettings } from './whatsapp.settings.js';
import { WhatsappSuppression } from './whatsapp.suppression.js';
import { cleanParam, toWhatsappNumber } from './whatsapp.format.js';

export const MAX_OFFER_AUDIENCE = 5000;
export const MAX_OFFER_LENGTH = 600;
/** Only customers with a bill in this many days are messaged: old numbers are the ones that report spam or no longer exist. */
export const OFFER_RECENT_DAYS = 365;
export const DEFAULT_OFFER_MIN_DAYS = 7;

export interface Recipient {
  phone: string;
  name: string;
}

/** Offer broadcasts: who would get one, sending it, and how past ones went. */
@Injectable()
export class WhatsappOffers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly outbox: WhatsappOutbox,
    private readonly settings: WhatsappSettings,
    private readonly suppression: WhatsappSuppression,
    private readonly config: ConfigService,
  ) {}

  private sending = false;

  /** A customer gets at most one offer in this many days, however many are sent. */
  get minDaysBetween(): number {
    const v = Number(this.config.get<string>('WHATSAPP_OFFER_MIN_DAYS'));
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : DEFAULT_OFFER_MIN_DAYS;
  }

  /**
   * Customers who had a completed bill in the last year at any of the branches (every branch when none are
   * given), one entry per WhatsApp number. Customers without a usable number are left out.
   */
  private async candidates(branchIds: string[]): Promise<Recipient[]> {
    const rows = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.COMPLETED,
        customerId: { not: null },
        closedAt: { gte: new Date(Date.now() - OFFER_RECENT_DAYS * 86_400_000) },
        ...(branchIds.length ? { branchId: { in: branchIds } } : {}),
      },
      distinct: ['customerId'],
      select: { customer: { select: { name: true, phone: true } } },
    });
    const seen = new Set<string>();
    const out: Recipient[] = [];
    for (const r of rows) {
      const phone = toWhatsappNumber(r.customer?.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      out.push({ phone, name: r.customer?.name ?? '' });
    }
    return out;
  }

  /** Who is left after dropping opted-out / undeliverable numbers and anyone who got an offer recently. */
  async audience(branchIds: string[]) {
    const all = await this.candidates(branchIds);
    const phones = all.map((r) => r.phone);
    const blocked = await this.suppression.blockedAmong(phones, WhatsappKind.OFFER);
    const since = new Date(Date.now() - this.minDaysBetween * 86_400_000);
    const recent = new Set<string>();
    for (let i = 0; i < phones.length; i += 1000) {
      const rows = await this.prisma.whatsappMessage.findMany({
        where: { kind: WhatsappKind.OFFER, to: { in: phones.slice(i, i + 1000) }, createdAt: { gte: since }, status: { not: WhatsappStatus.FAILED } },
        select: { to: true },
        distinct: ['to'],
      });
      for (const r of rows) recent.add(r.to);
    }
    const recipients = all.filter((r) => !blocked.has(r.phone) && !recent.has(r.phone));
    return {
      recipients,
      count: recipients.length,
      optedOut: all.filter((r) => blocked.has(r.phone)).length,
      recentlyMessaged: all.filter((r) => !blocked.has(r.phone) && recent.has(r.phone)).length,
    };
  }

  async recipients(branchIds: string[]): Promise<Recipient[]> {
    return (await this.audience(branchIds)).recipients;
  }

  async send(input: { message: string; imageUrl?: string; branchIds: string[] }) {
    const delivery = await this.settings.getDelivery();
    if (!this.client.isConfigured() || delivery.mode !== 'api') {
      throw new BadRequestException('Offers are sent through the WhatsApp Business API. Switch on "Automatic" first.');
    }
    const message = input.message.trim();
    if (message.length < 5) throw new BadRequestException('Write the offer message first.');
    if (message.length > MAX_OFFER_LENGTH) {
      throw new BadRequestException(`Keep the offer to ${MAX_OFFER_LENGTH} characters or fewer.`);
    }
    const imageUrl = input.imageUrl?.trim() || undefined;
    if (imageUrl && !/^https:\/\/.+\.(jpe?g|png)(\?.*)?$/i.test(imageUrl)) {
      throw new BadRequestException('The offer picture must be a JPG or PNG image.');
    }
    // Pictures come from the app's own storage; WhatsApp's servers fetch this URL, so don't let it point anywhere else.
    const storageHost = (() => {
      try {
        return new URL(this.config.get<string>('SUPABASE_URL') ?? '').host;
      } catch {
        return '';
      }
    })();
    if (imageUrl && storageHost && new URL(imageUrl).host !== storageHost) {
      throw new BadRequestException('Upload the offer picture in the app (it must be stored with CAVE).');
    }
    const pause = await this.settings.getPause();
    if (pause.all || pause.offers) {
      throw new BadRequestException(`Sending is paused: ${(pause.all ?? pause.offers)!.reason}`);
    }
    if (input.branchIds.length) {
      const found = await this.prisma.branch.count({ where: { id: { in: input.branchIds } } });
      if (found !== new Set(input.branchIds).size) throw new BadRequestException('One of the chosen branches was not found.');
    }

    // The same offer to the same branches twice in a day is almost always a double tap; it would message everyone twice.
    const contentHash = createHash('sha256')
      .update([message, imageUrl ?? '', [...new Set(input.branchIds)].sort().join(',')].join('\n'))
      .digest('hex');
    const duplicate = await this.prisma.whatsappOffer.findFirst({
      where: { contentHash, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('This exact offer was already sent in the last 24 hours.');
    if (this.sending) throw new BadRequestException('An offer is already being sent. Wait a moment.');
    this.sending = true;
    try {
      return await this.sendNow(message, imageUrl, input.branchIds, contentHash);
    } finally {
      this.sending = false;
    }
  }

  private async sendNow(message: string, imageUrl: string | undefined, branchIds: string[], contentHash: string) {
    const recipients = await this.recipients(branchIds);
    if (recipients.length === 0) {
      throw new BadRequestException(
        `No one to send to: customers without a number, who opted out, or who already got an offer in the last ${this.minDaysBetween} days are skipped.`,
      );
    }
    // WhatsApp limits how many people a business may start conversations with each day (low for a new number),
    // and exceeding it hurts the number's rating, so stay under our own limit.
    const used = await this.outbox.offersInLastDay();
    const limit = this.outbox.offerDailyLimit;
    if (used + recipients.length > limit) {
      throw new BadRequestException(
        `That would send ${recipients.length} offers, but only ${Math.max(0, limit - used)} more can go out in 24 hours (limit ${limit}). Choose fewer branches or wait.`,
      );
    }

    const offer = await this.prisma.whatsappOffer.create({
      data: { message, imageUrl: imageUrl ?? null, branchIds, audience: recipients.length, contentHash },
    });
    const template = imageUrl ? this.client.templates.offerImage : this.client.templates.offer;
    let queued = 0;
    for (const r of recipients) {
      const first = r.name.trim().split(/\s+/)[0] || 'there';
      const ok = await this.outbox.enqueue({
        kind: WhatsappKind.OFFER,
        dedupeKey: `offer:${offer.id}:${r.phone}`,
        to: r.phone,
        template,
        params: [cleanParam(first, 30), cleanParam(message, 900)],
        header: imageUrl ? { link: imageUrl } : undefined,
        offerId: offer.id,
      });
      if (ok) queued += 1;
    }
    return { offerId: offer.id, audience: recipients.length, queued };
  }

  /** Recent offers with how many messages went out, failed or are still waiting. */
  async list() {
    const offers = await this.prisma.whatsappOffer.findMany({ orderBy: { createdAt: 'desc' }, take: 15 });
    if (offers.length === 0) return [];
    const [counts, branches] = await Promise.all([
      this.prisma.whatsappMessage.groupBy({
        by: ['offerId', 'status'],
        where: { offerId: { in: offers.map((o) => o.id) } },
        _count: { _all: true },
      }),
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);
    const nameOf = new Map(branches.map((b) => [b.id, b.name]));
    return offers.map((o) => {
      const n = (status: WhatsappStatus) =>
        counts.find((c) => c.offerId === o.id && c.status === status)?._count._all ?? 0;
      return {
        id: o.id,
        message: o.message,
        imageUrl: o.imageUrl,
        branches: o.branchIds.length ? o.branchIds.map((id) => nameOf.get(id) ?? 'Branch') : ['All branches'],
        audience: o.audience,
        sent: n(WhatsappStatus.SENT),
        failed: n(WhatsappStatus.FAILED),
        waiting: n(WhatsappStatus.PENDING),
        createdAt: o.createdAt,
      };
    });
  }
}
