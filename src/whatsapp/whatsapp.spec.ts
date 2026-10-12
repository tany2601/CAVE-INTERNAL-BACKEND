import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentMode, SessionStatus, WhatsappStatus } from '@prisma/client';
import {
  billNumber,
  buildBillParams,
  buildReportParams,
  cleanParam,
  inr,
  toWhatsappNumber,
} from './whatsapp.format.js';
import { WhatsappClient, WhatsappSendError } from './whatsapp.client.js';
import { RETRY_MINUTES, WhatsappOutbox } from './whatsapp.outbox.js';
import { WhatsappService } from './whatsapp.service.js';
import { dueReports, periodLabel, WhatsappReports } from './whatsapp.reports.js';
import { WhatsappSettings } from './whatsapp.settings.js';
import { WhatsappOffers } from './whatsapp.offers.js';

const config = (values: Record<string, string> = {}) => ({ get: (k: string) => values[k] }) as any;
const configured = { WHATSAPP_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: '123' };
// 6 Oct 2026 21:30 IST = 16:00 UTC. Helper builds an instant from an IST wall-clock time.
const ist = (iso: string) => new Date(new Date(`${iso}:00Z`).getTime() - 5.5 * 3600_000);

describe('formatting', () => {
  it('formats rupees with Indian grouping', () => {
    expect(inr(150)).toBe('₹150');
    expect(inr(1444.1)).toBe('₹1,444.10');
    expect(inr(123456.5)).toBe('₹1,23,456.50');
    expect(inr(0.1 + 0.2)).toBe('₹0.30');
    expect(inr(-100.32)).toBe('-₹100.32');
  });

  it('turns Indian mobile numbers into WhatsApp numbers and rejects junk', () => {
    expect(toWhatsappNumber('9876543210')).toBe('919876543210');
    expect(toWhatsappNumber('+91 98765 43210')).toBe('919876543210');
    expect(toWhatsappNumber('919876543210')).toBe('919876543210');
    expect(toWhatsappNumber('098765 43210')).toBe('919876543210');
    for (const bad of ['', null, undefined, '12345', '5876543210', '98765432101', 'abc']) {
      expect(toWhatsappNumber(bad as any)).toBeNull();
    }
  });

  it('cleans parameters to what WhatsApp templates accept', () => {
    expect(cleanParam('a\nb\tc   d')).toBe('a · b · c d');
    expect(cleanParam('')).toBe('-');
    expect(cleanParam('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('builds the bill message with every line, the discount, tip and the exact total', () => {
    const params = buildBillParams({
      id: 'aaaaaaaa-bbbb-cccc-dddd-0123456789ab',
      customerName: 'Ravi Kumar',
      paymentMode: PaymentMode.GPAY,
      discountAmount: '84.90',
      tipAmount: '50',
      totalAmount: '1014.10',
      branch: { name: 'CAVE Karkala' },
      services: [
        { serviceName: 'Haircut + Hair Wash & Style', price: '150' },
        { serviceName: 'Beard Spa', price: '300' },
      ],
      products: [{ productName: 'Matte Clay', price: '599' }],
    });
    expect(params).toEqual([
      'Ravi Kumar',
      'CAVE Karkala',
      'Haircut + Hair Wash & Style ₹150, Beard Spa ₹300, Matte Clay ₹599, Discount -₹84.90, Tip ₹50',
      '₹1,014.10',
      'GPay',
      billNumber('aaaaaaaa-bbbb-cccc-dddd-0123456789ab'),
    ]);
    expect(params[5]).toBe('6789AB');
    // The message prints the stored total; it never re-adds the lines itself.
  });

  it('does not thank a product-only sale by its placeholder name', () => {
    const p = buildBillParams({ id: '1', customerName: 'Product sale', paymentMode: 'CASH', discountAmount: 0, tipAmount: 0, totalAmount: 599, branch: null, services: [], products: [{ productName: 'Matte Clay', price: 599 }] });
    expect(p[0]).toBe('there');
  });

  it('shows a product-only bill without service lines', () => {
    const p = buildBillParams({
      id: '1', customerName: 'Product sale', paymentMode: 'CASH', discountAmount: 0, tipAmount: 0, totalAmount: 599,
      branch: null, services: [], products: [{ productName: 'Matte Clay', price: 599 }],
    });
    expect(p[2]).toBe('Matte Clay ₹599');
    expect(p[4]).toBe('Cash');
  });

  it('builds the report message in template order', () => {
    expect(
      buildReportParams({
        label: 'Daily',
        period: 'Tue, 6 Oct 2026',
        revenue: 12400,
        customers: 18,
        tips: 350,
        expenses: 1200.5,
        payouts: 2100,
        netInHand: 9449.5,
        branches: [
          { name: 'CAVE Karkala', revenue: 8200, customers: 11 },
          { name: 'CAVE Moodbidri', revenue: 4200, customers: 7 },
        ],
      }),
    ).toEqual([
      'Daily', 'Tue, 6 Oct 2026', '₹12,400', '18', '₹350', '₹1,200.50', '₹2,100', '₹9,449.50',
      'Karkala ₹8,200 (11) · Moodbidri ₹4,200 (7)',
    ]);
  });
});

describe('when reports are due (IST)', () => {
  const on = { daily: true, weekly: true, monthly: true };
  const keys = (iso: string, flags = on) => dueReports(ist(iso), flags).map((d) => d.key);

  it('sends the daily report from 9:30 PM for that day', () => {
    // 7 Oct 2026 is a Wednesday: no weekly or monthly report is due, only the daily one.
    expect(keys('2026-10-07T21:29')).toEqual([]);
    expect(keys('2026-10-07T21:30')).toEqual(['daily:2026-10-07']);
    expect(keys('2026-10-07T23:59')).toEqual(['daily:2026-10-07']);
  });

  it('sends the weekly report on Monday morning for the week that just ended (Mon–Sun)', () => {
    // 5 Oct 2026 is a Monday.
    expect(keys('2026-10-05T08:59')).toEqual([]);
    const w = dueReports(ist('2026-10-05T09:00'), on).find((d) => d.kind === 'weekly')!;
    expect([w.from, w.to, w.key]).toEqual(['2026-09-28', '2026-10-04', 'weekly:2026-09-28']);
    // Tuesday still catches it up if the server was down on Monday; Wednesday does not.
    expect(keys('2026-10-06T10:00')).toContain('weekly:2026-09-28');
    expect(keys('2026-10-07T10:00')).not.toContain('weekly:2026-09-28');
  });

  it('sends the monthly report on the 1st for the month that just ended, including across years', () => {
    const m = dueReports(ist('2026-10-01T09:00'), on).find((d) => d.kind === 'monthly')!;
    expect([m.from, m.to]).toEqual(['2026-09-01', '2026-09-30']);
    const jan = dueReports(ist('2027-01-01T10:00'), on).find((d) => d.kind === 'monthly')!;
    expect([jan.from, jan.to]).toEqual(['2026-12-01', '2026-12-31']);
    expect(keys('2026-10-01T08:00')).not.toContain('monthly:2026-09-01');
    expect(keys('2026-10-03T10:00')).not.toContain('monthly:2026-09-01');
  });

  it('honours the switches', () => {
    expect(keys('2026-10-05T22:00', { daily: false, weekly: false, monthly: false })).toEqual([]);
    expect(keys('2026-10-05T22:00', { daily: true, weekly: false, monthly: false })).toEqual(['daily:2026-10-05']);
    expect(keys('2026-10-05T22:00', { daily: false, weekly: true, monthly: false })).toEqual(['weekly:2026-09-28']);
  });

  it('labels periods readably', () => {
    expect(periodLabel('daily', '2026-10-06', '2026-10-06')).toBe('Tue, 6 Oct 2026');
    expect(periodLabel('weekly', '2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct 2026');
    expect(periodLabel('monthly', '2026-09-01', '2026-09-30')).toBe('September 2026');
  });
});

describe('WhatsappClient', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });

  it('is off until both the token and the phone number id are set', () => {
    expect(new WhatsappClient(config()).isConfigured()).toBe(false);
    expect(new WhatsappClient(config({ WHATSAPP_TOKEN: 'x' })).isConfigured()).toBe(false);
    expect(new WhatsappClient(config(configured)).isConfigured()).toBe(true);
  });

  it('posts a template message with the parameters in order', async () => {
    reply(200, { messages: [{ id: 'wamid.1' }] });
    const res = await new WhatsappClient(config(configured)).sendTemplate('919876543210', 'cave_bill', ['A', 'B']);
    expect(res.id).toBe('wamid.1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toMatchObject({
      to: '919876543210',
      type: 'template',
      template: {
        name: 'cave_bill',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }],
      },
    });
  });

  it('marks bad numbers / templates as permanent and rate limits / outages as retryable', async () => {
    const client = new WhatsappClient(config(configured));
    reply(400, { error: { message: 'Recipient not on WhatsApp', code: 131026 } });
    await expect(client.sendTemplate('91x', 't', [])).rejects.toMatchObject({ retryable: false });
    reply(429, { error: { message: 'Too many', code: 130429 } });
    await expect(client.sendTemplate('91x', 't', [])).rejects.toMatchObject({ retryable: true });
    reply(503, {});
    await expect(client.sendTemplate('91x', 't', [])).rejects.toMatchObject({ retryable: true });
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(client.sendTemplate('91x', 't', [])).rejects.toMatchObject({ retryable: true });
  });
});

describe('WhatsappOutbox', () => {
  let rows: any[];
  let prisma: any;
  let client: any;
  let settings: any;
  let suppression: any;
  let pauseState: any;
  let outbox: WhatsappOutbox;
  let claimable: boolean;

  beforeEach(() => {
    rows = [];
    claimable = true;
    pauseState = {};
    prisma = {
      whatsappMessage: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          if (rows.some((r) => r.dedupeKey === data.dedupeKey)) throw Object.assign(new Error('dup'), { code: 'P2002' });
          rows.push({ id: `m${rows.length}`, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(Date.now() - 1000), lockedUntil: null, ...data });
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: any) =>
          rows.filter(
            (r) =>
              r.status !== 'SENT' &&
              r.attempts < RETRY_MINUTES.length + 1 &&
              r.nextAttemptAt <= new Date() &&
              !(where.kind?.not && r.kind === where.kind.not),
          ),
        ),
        // The "claim": succeeds once, for a row nobody else holds
        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const row = rows.find((r) => r.id === where.id);
          if (!claimable || !row || row.attempts !== where.attempts || (row.lockedUntil && row.lockedUntil > new Date())) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    client = { isConfigured: vi.fn().mockReturnValue(true), sendTemplate: vi.fn().mockResolvedValue({ id: 'wamid.9' }) };
    settings = {
      getPause: vi.fn(async () => pauseState),
      pause: vi.fn(async (scope: string, minutes: number, reason: string) => {
        pauseState = { ...pauseState, [scope]: { until: new Date(Date.now() + minutes * 60_000).toISOString(), reason } };
      }),
    };
    suppression = { isBlocked: vi.fn().mockResolvedValue(false), add: vi.fn().mockResolvedValue(true) };
    outbox = new WhatsappOutbox(prisma, client as any, settings, suppression, { get: () => undefined } as any);
  });

  // enqueue() starts a background flush; wait for it so the test controls what happens next.
  const idle = async () => {
    while ((outbox as any).flushing) await new Promise((r) => setTimeout(r, 0));
  };
  const msg = (key = 'bill:1', kind: 'BILL' | 'OFFER' = 'BILL') => ({ kind, dedupeKey: key, to: '919876543210', template: 'cave_bill', params: ['x'] });

  it('sends a queued message once and records it as sent', async () => {
    await outbox.enqueue(msg());
    await idle();
    await outbox.flush();
    expect(client.sendTemplate).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: WhatsappStatus.SENT, attempts: 1, providerMessageId: 'wamid.9', lockedUntil: null });
    await outbox.flush();
    expect(client.sendTemplate).toHaveBeenCalledTimes(1);
  });

  it('never queues the same message twice', async () => {
    expect(await outbox.enqueue(msg())).toBe(true);
    expect(await outbox.enqueue(msg())).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('puts failed messages from the last 24 hours back in the queue', async () => {
    prisma.whatsappMessage.updateMany = vi.fn().mockResolvedValue({ count: 3 });
    expect(await outbox.retryFailed()).toBe(3);
    const call = prisma.whatsappMessage.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe('FAILED');
    expect(Date.now() - call.where.createdAt.gte.getTime()).toBeLessThan(24 * 3600_000 + 5000);
    expect(call.data).toMatchObject({ status: 'PENDING', attempts: 0, lastError: null });
  });

  it('queues nothing when WhatsApp is not configured', async () => {
    client.isConfigured.mockReturnValue(false);
    expect(await outbox.enqueue(msg())).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it('does not queue a message for a blocked number', async () => {
    suppression.isBlocked.mockResolvedValue(true);
    expect(await outbox.enqueue(msg('offer:1', 'OFFER'))).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it('retries temporary failures later, then succeeds', async () => {
    client.sendTemplate.mockRejectedValueOnce(new WhatsappSendError('rate limited', true));
    await outbox.enqueue(msg());
    await idle();
    expect(rows[0]).toMatchObject({ status: WhatsappStatus.FAILED, attempts: 1, lastError: 'rate limited' });
    expect(rows[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000); // waits ~1 minute
    rows[0].nextAttemptAt = new Date(Date.now() - 1000); // time passes
    await outbox.flush();
    expect(rows[0]).toMatchObject({ status: WhatsappStatus.SENT, attempts: 2 });
  });

  it('gives up straight away on permanent failures', async () => {
    client.sendTemplate.mockRejectedValue(new WhatsappSendError('Bad parameter', false, 132000));
    await outbox.enqueue(msg());
    await idle();
    expect(rows[0].attempts).toBe(RETRY_MINUTES.length + 1);
    expect(rows[0].errorCode).toBe(132000);
    rows[0].nextAttemptAt = new Date(Date.now() - 1000);
    await outbox.flush();
    expect(client.sendTemplate).toHaveBeenCalledTimes(1);
  });

  it('leaves a message alone when another process has claimed it (no double send)', async () => {
    await outbox.enqueue(msg());
    await idle();
    rows[0].status = 'PENDING';
    rows[0].sentAt = undefined;
    client.sendTemplate.mockClear();
    claimable = false;
    await outbox.flush();
    expect(client.sendTemplate).not.toHaveBeenCalled();
  });

  it('skips a number that opted out after the message was queued', async () => {
    client.isConfigured.mockReturnValue(true);
    await outbox.enqueue(msg('offer:1', 'OFFER'));
    await idle();
    rows[0].status = 'PENDING';
    rows[0].attempts = 0;
    client.sendTemplate.mockClear();
    suppression.isBlocked.mockResolvedValue(true);
    await outbox.flush();
    expect(client.sendTemplate).not.toHaveBeenCalled();
    expect(rows[0].lastError).toMatch(/opted out/);
  });

  it('pauses everything when WhatsApp rejects the token, and keeps the message for later', async () => {
    client.sendTemplate.mockRejectedValue(new WhatsappSendError('Error validating access token', false, 190));
    await outbox.enqueue(msg('bill:1'));
    await idle();
    expect(settings.pause).toHaveBeenCalledWith('all', 30, expect.stringMatching(/token/));
    expect(rows[0].attempts).toBeLessThanOrEqual(RETRY_MINUTES.length); // not given up
    // while paused nothing is attempted
    client.sendTemplate.mockClear();
    await outbox.enqueue(msg('bill:2'));
    await idle();
    expect(client.sendTemplate).not.toHaveBeenCalled();
  });

  it('pauses offers (not bills) for a day when WhatsApp says the number is sending spam', async () => {
    client.sendTemplate.mockRejectedValueOnce(new WhatsappSendError('Spam rate limit hit', false, 131048));
    await outbox.enqueue(msg('offer:1', 'OFFER'));
    await idle();
    expect(settings.pause).toHaveBeenCalledWith('offers', 24 * 60, expect.any(String));
    await outbox.enqueue(msg('offer:2', 'OFFER'));
    await outbox.enqueue(msg('bill:9', 'BILL'));
    await idle();
    await outbox.flush();
    const sentTo = client.sendTemplate.mock.calls.length;
    expect(sentTo).toBe(2); // the first (failed) offer + the bill; the second offer waits
    expect(rows.find((r) => r.dedupeKey === 'bill:9').status).toBe(WhatsappStatus.SENT);
    expect(rows.find((r) => r.dedupeKey === 'offer:2').status).toBe('PENDING');
  });

  it('stops messaging a number that is not on WhatsApp', async () => {
    client.sendTemplate.mockRejectedValue(new WhatsappSendError('Message undeliverable', false, 131026));
    await outbox.enqueue(msg());
    await idle();
    expect(suppression.add).toHaveBeenCalledWith('919876543210', 'UNDELIVERABLE');
    expect(rows[0].attempts).toBe(RETRY_MINUTES.length + 1);
  });

  it('holds offers back once the daily limit is reached, but still sends bills', async () => {
    prisma.whatsappMessage.count.mockResolvedValue(200); // already sent 200 offers today
    await outbox.enqueue(msg('offer:1', 'OFFER'));
    await outbox.enqueue(msg('bill:1', 'BILL'));
    await idle();
    await outbox.flush();
    expect(rows.find((r) => r.dedupeKey === 'bill:1').status).toBe(WhatsappStatus.SENT);
    expect(rows.find((r) => r.dedupeKey === 'offer:1').status).toBe('PENDING');
  });
});
describe('offers', () => {
  const customer = (phone: string, name: string) => ({ customer: { phone, name } });
  const make = (
    opts: { rows?: any[]; mode?: string; configured?: boolean; blocked?: string[]; recent?: string[]; duplicate?: boolean; used?: number; limit?: number; paused?: any; supabase?: string } = {},
  ) => {
    const prisma: any = {
      session: { findMany: vi.fn().mockResolvedValue(opts.rows ?? []) },
      branch: { count: vi.fn().mockResolvedValue(1) },
      whatsappOffer: {
        create: vi.fn().mockResolvedValue({ id: 'o1' }),
        findFirst: vi.fn().mockResolvedValue(opts.duplicate ? { id: 'old' } : null),
      },
      whatsappMessage: { findMany: vi.fn().mockResolvedValue((opts.recent ?? []).map((to) => ({ to }))) },
    };
    const outbox: any = {
      enqueue: vi.fn().mockResolvedValue(true),
      offerDailyLimit: opts.limit ?? 200,
      offersInLastDay: vi.fn().mockResolvedValue(opts.used ?? 0),
    };
    const client: any = {
      isConfigured: () => opts.configured !== false,
      templates: { offer: 'cave_offer', offerImage: 'cave_offer_image' },
    };
    const settings: any = {
      getDelivery: vi.fn().mockResolvedValue({ mode: opts.mode ?? 'api', billFormat: 'text' }),
      getPause: vi.fn().mockResolvedValue(opts.paused ?? {}),
    };
    const suppression: any = { blockedAmong: vi.fn().mockResolvedValue(new Set(opts.blocked ?? [])) };
    const config: any = { get: (k: string) => (k === 'SUPABASE_URL' ? opts.supabase : undefined) };
    return { offers: new WhatsappOffers(prisma, client, outbox, settings, suppression, config), prisma, outbox, suppression };
  };

  it('targets customers by branch, once per number, skipping unusable numbers', async () => {
    const { offers, prisma } = make({
      rows: [customer('9876500001', 'A'), customer('+91 98765 00001', 'A again'), customer('12345', 'Bad'), customer('9876500002', 'B')],
    });
    const list = await offers.recipients(['b1']);
    expect(list.map((r) => r.phone)).toEqual(['919876500001', '919876500002']);
    const where = prisma.session.findMany.mock.calls[0][0].where;
    expect(where.branchId).toEqual({ in: ['b1'] });
    // only customers who had a bill within the last year
    expect(Date.now() - where.closedAt.gte.getTime()).toBeGreaterThan(364 * 86_400_000);
    await offers.recipients([]); // every branch: no branch filter
    expect(prisma.session.findMany.mock.calls[1][0].where.branchId).toBeUndefined();
  });

  it('leaves out opted-out numbers and anyone who got an offer recently, and says how many', async () => {
    const { offers } = make({
      rows: [customer('9876500001', 'A'), customer('9876500002', 'B'), customer('9876500003', 'C')],
      blocked: ['919876500001'],
      recent: ['919876500002'],
    });
    const a = await offers.audience([]);
    expect(a.recipients.map((r) => r.phone)).toEqual(['919876500003']);
    expect(a).toMatchObject({ count: 1, optedOut: 1, recentlyMessaged: 1 });
  });

  it('queues one message per customer with their first name and the offer text', async () => {
    const { offers, outbox, prisma } = make({ rows: [customer('9876500001', 'Ravi Kumar'), customer('9876500002', '')] });
    const res = await offers.send({ message: 'Flat 20% off beard spa this week!', branchIds: [] });
    expect(res).toEqual({ offerId: 'o1', audience: 2, queued: 2 });
    expect(outbox.enqueue.mock.calls[0][0]).toMatchObject({
      kind: 'OFFER', dedupeKey: 'offer:o1:919876500001', template: 'cave_offer', offerId: 'o1',
      params: ['Ravi', 'Flat 20% off beard spa this week!'],
    });
    expect(outbox.enqueue.mock.calls[1][0].params[0]).toBe('there');
    expect(prisma.whatsappOffer.create.mock.calls[0][0].data.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses the picture template and link when an image is attached', async () => {
    const { offers, outbox } = make({ rows: [customer('9876500001', 'Ravi')] });
    await offers.send({ message: 'Diwali offer: haircut + beard ₹299', imageUrl: 'https://x.supabase.co/offers/a.jpg', branchIds: [] });
    expect(outbox.enqueue.mock.calls[0][0]).toMatchObject({ template: 'cave_offer_image', header: { link: 'https://x.supabase.co/offers/a.jpg' } });
  });

  it('only accepts pictures stored with CAVE when storage is configured', async () => {
    const rows = [customer('9876500001', 'Ravi')];
    const ok = make({ rows, supabase: 'https://x.supabase.co' });
    await ok.offers.send({ message: 'Valid offer text', imageUrl: 'https://x.supabase.co/offers/a.jpg', branchIds: [] });
    await expect(
      make({ rows, supabase: 'https://x.supabase.co' }).offers.send({ message: 'Valid offer text', imageUrl: 'https://evil.test/a.jpg', branchIds: [] }),
    ).rejects.toThrow(/stored with CAVE/);
  });

  it('refuses a repeat of the same offer, a send that would pass the daily limit, and a paused account', async () => {
    const rows = [customer('9876500001', 'Ravi'), customer('9876500002', 'Meena')];
    await expect(make({ rows, duplicate: true }).offers.send({ message: 'Valid offer text', branchIds: [] })).rejects.toThrow(/already sent/);
    await expect(make({ rows, used: 199, limit: 200 }).offers.send({ message: 'Valid offer text', branchIds: [] })).rejects.toThrow(/only 1 more/);
    await expect(
      make({ rows, paused: { offers: { until: new Date(Date.now() + 1e6).toISOString(), reason: 'Paused for spam' } } }).offers.send({ message: 'Valid offer text', branchIds: [] }),
    ).rejects.toThrow(/paused/i);
  });

  it('refuses bad input and non-automatic modes', async () => {
    const rows = [customer('9876500001', 'Ravi')];
    await expect(make({ rows, mode: 'manual' }).offers.send({ message: 'Valid offer text', branchIds: [] })).rejects.toThrow(/Automatic/);
    await expect(make({ rows, configured: false }).offers.send({ message: 'Valid offer text', branchIds: [] })).rejects.toThrow(/Automatic/);
    await expect(make({ rows }).offers.send({ message: 'hi', branchIds: [] })).rejects.toThrow(/Write the offer/);
    await expect(make({ rows }).offers.send({ message: 'x'.repeat(601), branchIds: [] })).rejects.toThrow(/600/);
    await expect(make({ rows }).offers.send({ message: 'Valid offer text', imageUrl: 'https://x.test/a.webp', branchIds: [] })).rejects.toThrow(/JPG or PNG/);
    await expect(make({ rows }).offers.send({ message: 'Valid offer text', imageUrl: 'http://x.test/a.jpg', branchIds: [] })).rejects.toThrow(/JPG or PNG/);
    await expect(make({ rows: [] }).offers.send({ message: 'Valid offer text', branchIds: [] })).rejects.toThrow(/No one to send to/);
  });
});
