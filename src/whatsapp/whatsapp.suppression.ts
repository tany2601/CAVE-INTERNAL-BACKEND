import { Injectable } from '@nestjs/common';
import { WhatsappKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UNDELIVERABLE_DAYS } from './whatsapp.policy.js';

/** Numbers we must not message: replied STOP (offers) or can't receive WhatsApp (everything, for a while). */
@Injectable()
export class WhatsappSuppression {
  constructor(private readonly prisma: PrismaService) {}

  private applies(rec: { reason: string; updatedAt: Date }, kind: WhatsappKind, now: number): boolean {
    if (rec.reason === 'STOP') return kind === WhatsappKind.OFFER;
    return now - rec.updatedAt.getTime() < UNDELIVERABLE_DAYS * 86_400_000;
  }

  async isBlocked(phone: string, kind: WhatsappKind): Promise<boolean> {
    const rec = await this.prisma.whatsappSuppression.findUnique({ where: { phone } });
    return !!rec && this.applies(rec, kind, Date.now());
  }

  /** Which of these numbers must not get a message of this kind. */
  async blockedAmong(phones: string[], kind: WhatsappKind): Promise<Set<string>> {
    if (phones.length === 0) return new Set();
    const out = new Set<string>();
    const now = Date.now();
    for (let i = 0; i < phones.length; i += 1000) {
      const rows = await this.prisma.whatsappSuppression.findMany({ where: { phone: { in: phones.slice(i, i + 1000) } } });
      for (const r of rows) if (this.applies(r, kind, now)) out.add(r.phone);
    }
    return out;
  }

  /** Returns true when the number was newly added (so a confirmation is sent once, not on every repeat). */
  async add(phone: string, reason: 'STOP' | 'UNDELIVERABLE'): Promise<boolean> {
    const existing = await this.prisma.whatsappSuppression.findUnique({ where: { phone } });
    if (existing?.reason === 'STOP' && reason === 'UNDELIVERABLE') return false; // never downgrade an opt-out
    await this.prisma.whatsappSuppression.upsert({
      where: { phone },
      create: { phone, reason },
      update: { reason },
    });
    return !existing || existing.reason !== reason;
  }

  /** The customer said START: offers are allowed again. Returns true when there was an opt-out to lift. */
  async lift(phone: string): Promise<boolean> {
    const res = await this.prisma.whatsappSuppression.deleteMany({ where: { phone, reason: 'STOP' } });
    return res.count > 0;
  }

  async counts(): Promise<{ optedOut: number; undeliverable: number }> {
    const [optedOut, undeliverable] = await Promise.all([
      this.prisma.whatsappSuppression.count({ where: { reason: 'STOP' } }),
      this.prisma.whatsappSuppression.count({ where: { reason: 'UNDELIVERABLE' } }),
    ]);
    return { optedOut, undeliverable };
  }
}
