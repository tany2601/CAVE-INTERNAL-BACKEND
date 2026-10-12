import { Injectable, Logger } from '@nestjs/common';
import { SessionStatus, WhatsappKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhatsappSettings } from './whatsapp.settings.js';
import { BillImageData, renderBillPng } from './bill-image.js';
import { WhatsappClient } from './whatsapp.client.js';
import { WhatsappOutbox } from './whatsapp.outbox.js';
import { buildBillParams, toWhatsappNumber } from './whatsapp.format.js';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger('WhatsApp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly outbox: WhatsappOutbox,
    private readonly settings: WhatsappSettings,
  ) {}

  /**
   * Queues the bill for a just-closed session to the customer's WhatsApp number. Never throws: a
   * WhatsApp problem must not affect billing. Does nothing when WhatsApp isn't configured or the
   * bill has no valid number.
   */
  async sendBill(sessionId: string): Promise<void> {
    try {
      if (!this.client.isConfigured()) return;
      // Only the automatic mode sends from the server; "manual" and "off" leave it to the staff / nobody.
      const { mode, billFormat } = await this.settings.getDelivery();
      if (mode !== 'api') return;
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: { branch: { select: { name: true } }, customer: { select: { qualifyingCompletedSessionsCount: true } }, services: true, products: true },
      });
      if (!session || session.status !== SessionStatus.COMPLETED) return;
      const to = toWhatsappNumber(session.customerMobile);
      if (!to) return;
      const base = {
        kind: WhatsappKind.BILL,
        dedupeKey: `bill:${session.id}`,
        to,
        params: buildBillParams(session),
        sessionId: session.id,
      };
      // The picture is made and uploaded now; if either step fails the customer still gets the text bill.
      let header: { id: string } | undefined;
      if (billFormat === 'image') {
        try {
          header = { id: await this.client.uploadImage(renderBillPng(this.imageData(session)), `bill-${session.id}.png`) };
        } catch (e) {
          this.logger.warn(`Bill picture failed, sending text instead: ${(e as Error).message}`);
        }
      }
      await this.outbox.enqueue({
        ...base,
        template: header ? this.client.templates.billImage : this.client.templates.bill,
        header,
      });
    } catch (e) {
      this.logger.error(`Could not queue the bill for ${sessionId}: ${(e as Error).message}`);
    }
  }

  /**
   * Where a bill's WhatsApp message stands, for the staff screen right after billing:
   * "none" (nothing queued), "PENDING", "SENT" or "FAILED". Only for a bill of the caller's own branch.
   */
  async billStatus(sessionId: string, branchId: string): Promise<{ status: 'none' | 'PENDING' | 'SENT' | 'FAILED' }> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { branchId: true } });
    if (!session || session.branchId !== branchId) return { status: 'none' };
    const msg = await this.prisma.whatsappMessage.findUnique({
      where: { dedupeKey: `bill:${sessionId}` },
      select: { status: true },
    });
    return { status: msg?.status ?? 'none' };
  }

  private imageData(session: {
    id: string;
    customerName: string;
    paymentMode: string | null;
    closedAt: Date | null;
    discountAmount: unknown;
    tipAmount: unknown;
    totalAmount: unknown;
    branch?: { name: string } | null;
    customer?: { qualifyingCompletedSessionsCount: number } | null;
    services: { serviceName: string; price: unknown }[];
    products: { productName: string; price: unknown }[];
  }): BillImageData {
    return {
      id: session.id,
      customerName: session.customerName,
      branchName: session.branch?.name ?? 'CAVE',
      paymentMode: session.paymentMode,
      closedAt: session.closedAt,
      discountAmount: Number(session.discountAmount ?? 0),
      tipAmount: Number(session.tipAmount ?? 0),
      totalAmount: Number(session.totalAmount ?? 0),
      services: session.services.map((s) => ({ name: s.serviceName, price: Number(s.price) })),
      products: session.products.map((p) => ({ name: p.productName, price: Number(p.price) })),
      loyalty: session.customer ? { visits: session.customer.qualifyingCompletedSessionsCount } : undefined,
    };
  }

  /**
   * The bill as a PNG for the staff app (shown after billing and shared by hand in manual mode).
   * Only a closed bill of the caller's own branch can be fetched.
   */
  async billImage(sessionId: string, branchId: string): Promise<Buffer | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { branch: { select: { name: true } }, customer: { select: { qualifyingCompletedSessionsCount: true } }, services: true, products: true },
    });
    if (!session || session.branchId !== branchId || session.status !== SessionStatus.COMPLETED) return null;
    return renderBillPng(this.imageData(session));
  }
}
