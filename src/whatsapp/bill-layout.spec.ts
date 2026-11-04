import { describe, it, expect, vi } from 'vitest';
import { SessionStatus } from '@prisma/client';
import { buildBillImageParamsV2, buildBillParams, buildBillParamsV2, usesLineLayout } from './whatsapp.format.js';
import { WhatsappService } from './whatsapp.service.js';

// The bill from the report: three services, a product bought twice, and GST on both.
const bill = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-000000000021',
  customerName: 'Thanay',
  paymentMode: 'GPAY',
  discountAmount: 0,
  tipAmount: 0,
  totalAmount: 4785.64,
  branch: { name: 'CAVE Karkala', reviewUrl: 'https://g.page/r/CkarkalaEAI/review' },
  services: [
    { serviceName: 'Hair Spa', price: 600 },
    { serviceName: 'Beard Spa', price: 300 },
    { serviceName: 'Hydra Facial', price: 3000 },
  ],
  products: [
    { productName: 'De-Tan Coffee Face Wash- 100ml', price: 299 },
    { productName: 'De-Tan Coffee Face Wash- 100ml', price: 299 },
  ],
  invoiceNumber: 'CV/26-27/000021',
  gstin: '29AAOCC1889N1ZO',
  gstServicesRate: 5,
  gstServicesCgst: 97.14,
  gstServicesSgst: 97.14,
  gstProductsRate: 18,
  gstProductsCgst: 53.82,
  gstProductsSgst: 53.82,
};

describe('line-by-line WhatsApp bill (cave_bill_v2)', () => {
  it('gives every part of the bill its own variable, so the template can put them on separate lines', () => {
    expect(buildBillParamsV2(bill)).toEqual([
      'Thanay',
      'CAVE Karkala',
      'Hair Spa ₹600, Beard Spa ₹300, Hydra Facial ₹3,000',
      'De-Tan Coffee Face Wash- 100ml ×2 ₹598',
      'None',
      'CGST 2.5% ₹97.14, SGST 2.5% ₹97.14',
      'CGST 9% ₹53.82, SGST 9% ₹53.82',
      'None',
      '₹4,785.64',
      'GPay',
      'CV/26-27/000021',
      '29AAOCC1889N1ZO',
      'https://g.page/r/CkarkalaEAI/review',
    ]);
  });

  it('never sends an empty or multi-line value (WhatsApp rejects both)', () => {
    const params = buildBillParamsV2({ ...bill, services: [], products: [], tipAmount: 40, discountAmount: 10, invoiceNumber: null, gstin: null });
    for (const p of params) {
      expect(p.trim().length).toBeGreaterThan(0);
      expect(p).not.toMatch(/[\r\n\t]/);
    }
    expect(params[2]).toBe('None'); // no services
    expect(params[4]).toBe('-₹10');
    expect(params[7]).toBe('₹40');
    expect(params[11]).toBe('Not applicable'); // a bill without GST
    // a branch with no review link yet still fills the variable (it cannot be empty)
    expect(buildBillParamsV2({ ...bill, branch: { name: 'CAVE New' } })[12]).toBe('reply to this message with your feedback')
    expect(buildBillImageParamsV2({ ...bill, branch: { name: 'CAVE New' } })[5]).toBe('reply to this message with your feedback')
  });

  it('the picture caption is short: the picture has the lines', () => {
    expect(buildBillImageParamsV2(bill)).toEqual(['Thanay', 'CAVE Karkala', '₹4,785.64', 'GPay', 'CV/26-27/000021', 'https://g.page/r/CkarkalaEAI/review']);
  });

  it('only template names ending in _v2 use it; the older templates keep their single-paragraph layout', () => {
    expect(usesLineLayout('cave_bill_v2')).toBe(true);
    expect(usesLineLayout('cave_bill_image_v2')).toBe(true);
    expect(usesLineLayout('cave_bill_v3')).toBe(true);
    expect(usesLineLayout('cave_bill')).toBe(false);
    expect(buildBillParams(bill)).toHaveLength(6);
  });
});

describe('sending the bill picks the matching variables', () => {
  const make = (templates: { bill: string; billImage: string }, format: 'text' | 'image') => {
    const enqueue = vi.fn();
    const service = new WhatsappService(
      { session: { findUnique: vi.fn().mockResolvedValue({ ...bill, status: SessionStatus.COMPLETED, customerMobile: '9876543210', closedAt: new Date(), customer: null, branch: bill.branch, services: bill.services.map((s) => ({ ...s })), products: bill.products.map((p) => ({ ...p })) }) } } as any,
      { isConfigured: () => true, templates, uploadImage: vi.fn().mockResolvedValue('media-1') } as any,
      { enqueue } as any,
      { getDelivery: async () => ({ mode: 'api', billFormat: format }) } as any,
    );
    return { service, enqueue };
  };

  it('text bill on a _v2 template: thirteen variables', async () => {
    const { service, enqueue } = make({ bill: 'cave_bill_v2', billImage: 'cave_bill_image_v2' }, 'text');
    await service.sendBill('s1');
    expect(enqueue.mock.calls[0][0]).toMatchObject({ template: 'cave_bill_v2' });
    expect(enqueue.mock.calls[0][0].params).toHaveLength(13);
  });

  it('picture bill on a _v2 template: six variables and the picture', async () => {
    const { service, enqueue } = make({ bill: 'cave_bill_v2', billImage: 'cave_bill_image_v2' }, 'image');
    await service.sendBill('s1');
    expect(enqueue.mock.calls[0][0]).toMatchObject({ template: 'cave_bill_image_v2', header: { id: 'media-1' } });
    expect(enqueue.mock.calls[0][0].params).toHaveLength(6);
  });

  it('the older templates still get the six variables they were approved with', async () => {
    const { service, enqueue } = make({ bill: 'cave_bill', billImage: 'cave_bill_image' }, 'image');
    await service.sendBill('s1');
    expect(enqueue.mock.calls[0][0].params).toHaveLength(6);
  });
});
