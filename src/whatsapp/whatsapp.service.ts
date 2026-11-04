import { Injectable, Logger, Optional } from '@nestjs/common';
import { SessionStatus, WhatsappKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhatsappSettings } from './whatsapp.settings.js';
import { BillImageData, renderBillPng } from './bill-image.js';
import { WhatsappClient } from './whatsapp.client.js';
import { WhatsappOutbox } from './whatsapp.outbox.js';
import { branchAddress, buildBillImageParamsV2, buildBillParams, buildBillParamsV2, toWhatsappNumber, usesLineLayout } from './whatsapp.format.js';
import { GST_STATE_NAMES } from '../common/gst.js';
import { GstSettings } from '../common/gst-settings.service.js';

/** What a bill needs to know about its branch: the name, and the address printed on a tax invoice. */
const BRANCH_FOR_BILL = { name: true, address: true, city: true, state: true, phone: true, reviewUrl: true } as const;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger('WhatsApp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly outbox: WhatsappOutbox,
    private readonly settings: WhatsappSettings,
    @Optional() private readonly gst?: GstSettings,
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
        include: { branch: { select: BRANCH_FOR_BILL }, customer: { select: { qualifyingCompletedSessionsCount: true } }, services: true, products: true },
      });
      if (!session || session.status !== SessionStatus.COMPLETED) return;
      const to = toWhatsappNumber(session.customerMobile);
      if (!to) return;
      const base = {
        kind: WhatsappKind.BILL,
        dedupeKey: `bill:${session.id}`,
        to,
        sessionId: session.id,
      };
      const textParams = usesLineLayout(this.client.templates.bill) ? buildBillParamsV2(session) : buildBillParams(session);
      const imageParams = usesLineLayout(this.client.templates.billImage) ? buildBillImageParamsV2(session) : buildBillParams(session);
      // The picture is made and uploaded now; if either step fails the customer still gets the text bill.
      let header: { id: string } | undefined;
      if (billFormat === 'image') {
        try {
          header = { id: await this.client.uploadImage(renderBillPng(await this.imageData(session)), `bill-${session.id}.png`) };
        } catch (e) {
          this.logger.warn(`Bill picture failed, sending text instead: ${(e as Error).message}`);
        }
      }
      await this.outbox.enqueue({
        ...base,
        template: header ? this.client.templates.billImage : this.client.templates.bill,
        params: header ? imageParams : textParams,
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

  private async imageData(session: {
    id: string;
    customerName: string;
    paymentMode: string | null;
    closedAt: Date | null;
    discountAmount: unknown;
    tipAmount: unknown;
    totalAmount: unknown;
    branch?: { name: string; address?: string | null; city?: string | null; state?: string | null; phone?: string | null } | null;
    customer?: { qualifyingCompletedSessionsCount: number } | null;
    services: { serviceName: string; price: unknown }[];
    products: { productName: string; price: unknown }[];
    invoiceNumber?: string | null;
    gstin?: string | null;
    gstServicesRate?: unknown;
    gstServicesInclusive?: boolean;
    gstServicesTaxable?: unknown;
    gstServicesCgst?: unknown;
    gstServicesSgst?: unknown;
    gstProductsRate?: unknown;
    gstProductsInclusive?: boolean;
    gstProductsTaxable?: unknown;
    gstProductsCgst?: unknown;
    gstProductsSgst?: unknown;
  }): Promise<BillImageData> {
    // A bill with an invoice number is a GST tax invoice: it carries the GSTIN, the branch address and the tax.
    let invoice: BillImageData['invoice'];
    if (session.invoiceNumber && session.gstin) {
      const settings = await this.gst?.get();
      invoice = {
        number: session.invoiceNumber,
        gstin: session.gstin,
        legalName: settings?.legalName || undefined,
        placeOfSupply: GST_STATE_NAMES[session.gstin.slice(0, 2)],
        services: {
          rate: Number(session.gstServicesRate ?? 0),
          inclusive: !!session.gstServicesInclusive,
          taxable: Number(session.gstServicesTaxable ?? 0),
          cgst: Number(session.gstServicesCgst ?? 0),
          sgst: Number(session.gstServicesSgst ?? 0),
          code: settings?.servicesCode || undefined,
        },
        products: {
          rate: Number(session.gstProductsRate ?? 0),
          inclusive: !!session.gstProductsInclusive,
          taxable: Number(session.gstProductsTaxable ?? 0),
          cgst: Number(session.gstProductsCgst ?? 0),
          sgst: Number(session.gstProductsSgst ?? 0),
          code: settings?.productsCode || undefined,
        },
      };
    }
    return {
      invoice,
      branchAddress: branchAddress(session.branch) || undefined,
      branchPhone: session.branch?.phone || undefined,
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
      include: { branch: { select: BRANCH_FOR_BILL }, customer: { select: { qualifyingCompletedSessionsCount: true } }, services: true, products: true },
    });
    if (!session || session.branchId !== branchId || session.status !== SessionStatus.COMPLETED) return null;
    return renderBillPng(await this.imageData(session));
  }
}
