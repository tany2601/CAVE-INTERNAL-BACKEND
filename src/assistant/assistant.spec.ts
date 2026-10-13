import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentMode } from '@prisma/client';
import { makePeriod, parseDates, previousPeriod, readPeriod } from './period.js';
import { readBranch, understand } from './intent.js';
import { buildInsights } from './insights.js';
import { sayMoney, showMoney } from './speak.js';
import { AssistantService } from './assistant.service.js';
import { TtsService, VOICE_STYLE } from './tts.service.js';
import { buildReportModel, ReportInput, ReportSession } from '../whatsapp/report-model.js';

// Monday 12 Oct 2026 (Indian time)
const TODAY = '2026-10-12';
const NOW = new Date('2026-10-12T08:00:00Z');
const BRANCHES = [
  { id: 'b1', name: 'CAVE Karkala' },
  { id: 'b2', name: 'CAVE Moodbidri' },
];

describe('reading periods', () => {
  const p = (t: string) => readPeriod(t, TODAY);
  it('understands everyday words', () => {
    expect(p('today')).toMatchObject({ from: TODAY, to: TODAY, name: 'today' });
    expect(p("today's report")).toMatchObject({ name: 'today' });
    expect(p('daily')).toMatchObject({ name: 'today' });
    expect(p('Yesterday')).toMatchObject({ from: '2026-10-11', to: '2026-10-11' });
    expect(p('this week')).toMatchObject({ from: '2026-10-12', to: TODAY, name: 'this week' });
    expect(p('weekly')).toMatchObject({ name: 'this week' });
    expect(p('last week')).toMatchObject({ from: '2026-10-05', to: '2026-10-11' });
    expect(p('this month')).toMatchObject({ from: '2026-10-01', to: TODAY });
    expect(p('monthly')).toMatchObject({ name: 'this month' });
    expect(p('last month')).toMatchObject({ from: '2026-09-01', to: '2026-09-30', name: 'last month' });
    expect(p('last 7 days')).toMatchObject({ from: '2026-10-06', to: TODAY });
    expect(p('September')).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('reads dates, ranges and ignores ordinary words', () => {
    expect(p('1 Oct to 10 Oct')).toMatchObject({ from: '2026-10-01', to: '2026-10-10', name: null });
    expect(p('5th october')).toMatchObject({ from: '2026-10-05', to: '2026-10-05' });
    expect(p('from oct 3 till oct 9')).toMatchObject({ from: '2026-10-03', to: '2026-10-09' });
    expect(p('2026-09-28 to 2026-10-04')).toMatchObject({ from: '2026-09-28', to: '2026-10-04' });
    expect(p('05/10/2026')).toMatchObject({ from: '2026-10-05', to: '2026-10-05' });
    expect(p('10 oct to 1 oct')).toMatchObject({ from: '2026-10-01', to: '2026-10-10' }); // order fixed
    expect(parseDates('31/02/2026', TODAY)).toEqual([]); // not a real date
    expect(p('may i see the numbers')).toBeNull(); // "may" is just a word
    expect(p('in may')).toMatchObject({ from: '2026-05-01', to: '2026-05-31' });
    expect(p('show me something')).toBeNull();
  });

  it('compares with the stretch before', () => {
    expect(previousPeriod(makePeriod('2026-10-12', '2026-10-12', 'today'))).toMatchObject({ from: '2026-10-11', to: '2026-10-11', word: 'yesterday' });
    expect(previousPeriod(makePeriod('2026-10-05', '2026-10-11', 'last week'))).toMatchObject({ from: '2026-09-28', to: '2026-10-04', word: 'the week before' });
    // a month so far against the same days of the month before
    expect(previousPeriod(makePeriod('2026-10-01', '2026-10-12', 'this month'))).toMatchObject({ from: '2026-09-01', to: '2026-09-12', word: 'last month' });
    expect(previousPeriod(makePeriod('2026-03-01', '2026-03-31', 'last month'))).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousPeriod(makePeriod('2026-01-01', '2026-01-10', null))).toMatchObject({ from: '2025-12-01', to: '2025-12-10' });
  });
});

describe('understanding a message', () => {
  it('finds the branch', () => {
    expect(readBranch('Karkala', BRANCHES)).toBe('b1');
    expect(readBranch('how is moodbidri doing', BRANCHES)).toBe('b2');
    expect(readBranch('All branches', BRANCHES)).toBe('all');
    expect(readBranch('overall business', BRANCHES)).toBe('all');
    expect(readBranch('hello', BRANCHES)).toBeUndefined();
  });

  it('works out what is wanted', () => {
    const u = (t: string, ctx = {}) => understand(t, BRANCHES, ctx, TODAY);
    expect(u('hi').intent).toBe('greet');
    expect(u('Good evening').intent).toBe('greet');
    expect(u('give me the weekly report').intent).toBe('report');
    expect(u('Insights').intent).toBe('insights');
    expect(u('where are we lacking?').intent).toBe('insights');
    expect(u('how is the business doing').intent).toBe('insights');
    expect(u('Download Excel').intent).toBe('download');
    expect(u('xls for karkala this month')).toMatchObject({ intent: 'download', branch: 'b1', period: { name: 'this month' } });
    expect(u('Custom dates').wantsDates).toBe(true);
    expect(u('Karkala', { awaiting: 'branch', intent: 'download' })).toMatchObject({ intent: 'download', branch: 'b1' });
    expect(u('banana').intent).toBe('unknown');
  });
});

// ── the numbers ────────────────────────────────────────────────────────────────
const at = (day: string, hh: number) => new Date(`${day}T${String(hh).padStart(2, '0')}:00:00Z`);
const bill = (id: string, day: string, branchId: string, total: number, extra: Partial<ReportSession> = {}): ReportSession => ({
  id: `aaaaaaaa-0000-0000-0000-${id.padStart(12, '0')}`,
  branchId,
  stylistId: 'u1',
  customerId: `c${id}`,
  customerName: `Customer ${id}`,
  customerMobile: `98000000${id.padStart(2, '0')}`,
  paymentMode: PaymentMode.CASH,
  subtotal: total,
  discountType: 'NONE',
  discountAmount: 0,
  tipAmount: 0,
  totalAmount: total,
  startedAt: null,
  createdAt: at(day, 9),
  closedAt: at(day, 10),
  isEdited: false,
  isFreeVisit: false,
  services: [{ serviceName: 'Haircut', price: total }],
  products: [],
  customer: { createdAt: at('2026-01-01', 5), qualifyingCompletedSessionsCount: 4 },
  stylist: { name: 'Arjun' },
  ...extra,
});
const modelFor = (from: string, to: string, sessions: ReportSession[], branchId?: string) =>
  buildReportModel({
    from,
    to,
    generatedAt: NOW,
    branches: branchId ? BRANCHES.filter((b) => b.id === branchId) : BRANCHES,
    sessions: branchId ? sessions.filter((s) => s.branchId === branchId) : sessions,
    transactions: [],
    payouts: [],
    stylists: [],
    monthRevenue: new Map(),
  } as ReportInput);

describe('insights', () => {
  const vs = 'last month';
  const base = (cur: ReportSession[], prev: ReportSession[]) => ({
    cur: modelFor('2026-10-01', '2026-10-12', cur),
    prev: modelFor('2026-09-01', '2026-09-12', prev),
    vs,
    allBranches: true,
    days: 12,
    winBack: 0,
  });

  it('says revenue is up or down against the earlier stretch, and names the branch that slid', () => {
    const prev = [bill('1', '2026-09-05', 'b1', 5000), bill('2', '2026-09-06', 'b2', 5000)];
    const cur = [bill('3', '2026-10-05', 'b1', 6500), bill('4', '2026-10-06', 'b2', 2000)];
    const ins = buildInsights(base(cur, prev));
    expect(ins.find((i) => /Revenue is down/.test(i.text))).toMatchObject({ tone: 'warn' });
    expect(ins.some((i) => /Moodbidri slid 60%/.test(i.text))).toBe(true);
    expect(ins.some((i) => /Karkala leads/.test(i.text))).toBe(true);
    expect(ins.some((i) => /Moodbidri is behind/.test(i.text))).toBe(true);
    // the worst news comes first
    expect(ins[0].tone).toBe('warn');
    const up = buildInsights(base([bill('5', '2026-10-05', 'b1', 12000)], prev));
    expect(up.find((i) => /Revenue is up/.test(i.text))?.tone).toBe('good');
  });

  it('flags heavy discounts, thin repeat business and missing product sales', () => {
    const many = Array.from({ length: 10 }, (_, k) =>
      bill(String(20 + k), '2026-10-05', 'b1', 900, { discountAmount: 100, subtotal: 1000, customer: { createdAt: at('2026-10-01', 5), qualifyingCompletedSessionsCount: 1 } }),
    );
    const text = buildInsights({ ...base(many, []), allBranches: false }).map((i) => i.text).join(' | ');
    expect(text).toMatch(/Discounts took 10%/);
    expect(text).toMatch(/Only 0% of bills include a product/);
    expect(text).toMatch(/returning ones/);
  });

  it('keeps a spoken version with no symbols, and is honest when there is nothing', () => {
    const ins = buildInsights(base([bill('7', '2026-10-05', 'b1', 3000)], [bill('8', '2026-09-05', 'b1', 5000)]));
    for (const i of ins) expect(i.say).not.toMatch(/[₹%→]/);
    expect(buildInsights({ ...base([], []) })[0].text).toMatch(/No bills/);
  });

  it('says money the Indian way', () => {
    expect(sayMoney(12400)).toBe('12,400 rupees');
    expect(sayMoney(125000)).toBe('1.25 lakh rupees');
    expect(sayMoney(15000000)).toBe('1.5 crore rupees');
    expect(sayMoney(950.5)).toBe('950.5 rupees');
    expect(showMoney(124000)).toBe('₹1,24,000');
    expect(showMoney(950.5)).toBe('₹950.50');
  });
});

describe('the assistant conversation', () => {
  let exporter: any;
  let prisma: any;
  let svc: AssistantService;
  const sessions = [
    bill('1', '2026-10-12', 'b1', 4000, { tipAmount: 100, totalAmount: 4100 }),
    bill('2', '2026-10-12', 'b2', 2500),
    bill('3', '2026-10-06', 'b1', 3000),
    bill('4', '2026-09-30', 'b1', 3500),
  ];

  beforeEach(() => {
    exporter = {
      model: vi.fn(async (from: string, to: string, branchId?: string) =>
        modelFor(from, to, sessions.filter((s) => { const d = s.closedAt!.toISOString().slice(0, 10); return d >= from && d <= to; }), branchId)),
    };
    prisma = {
      branch: { findMany: vi.fn().mockResolvedValue(BRANCHES) },
      session: { groupBy: vi.fn().mockResolvedValue([{}, {}]) },
    };
    svc = new AssistantService(prisma, exporter);
  });

  it('asks which branch, then which period, then answers', async () => {
    const a = await svc.chat('report', undefined, NOW);
    expect(a.text).toBe('Which branch?');
    expect(a.chips).toEqual(['All branches', 'Karkala', 'Moodbidri']);
    expect(a.context.awaiting).toBe('branch');

    const b = await svc.chat('Karkala', a.context, NOW);
    expect(b.text).toBe('Daily, weekly or monthly?');
    expect(b.context).toMatchObject({ branch: 'b1', awaiting: 'period' });

    const c = await svc.chat('Today', b.context, NOW);
    expect(c.card?.title).toBe('Karkala · Today · 12 Oct 2026');
    expect(c.card?.stats.find((s) => s.label === 'Revenue')?.value).toBe('₹4,000');
    expect(c.card?.stats.find((s) => s.label === 'Customers')?.value).toBe('1');
    expect(c.card?.stats.find((s) => s.label === 'Tips')?.value).toBe('₹100');
    expect(c.speech).toMatch(/4,000 rupees/);
    expect(c.speech).not.toMatch(/₹/);
    expect(c.chips).toContain('Download Excel');
    expect(exporter.model).toHaveBeenCalledWith('2026-10-12', '2026-10-12', 'b1');
    expect(exporter.model).toHaveBeenCalledWith('2026-10-11', '2026-10-11', 'b1'); // yesterday, to compare
    expect(c.context).toMatchObject({ branch: 'b1', period: { from: '2026-10-12', to: '2026-10-12' }, intent: 'report' });
  });

  it('answers in one go when everything is in the message, for all branches', async () => {
    const r = await svc.chat('all branches this month', undefined, NOW);
    expect(r.card?.title).toBe('All branches · This month · 1 – 12 Oct 2026');
    expect(r.card?.stats.find((s) => s.label === 'Revenue')?.value).toBe('₹9,500'); // 4000 (tip excluded) + 2500 + 3000
    expect(exporter.model).toHaveBeenCalledWith('2026-10-01', '2026-10-12', undefined);
  });

  it('gives insights straight away (whole business, this month) and keeps what you chose afterwards', async () => {
    const r = await svc.chat('Insights', undefined, NOW);
    expect(r.card?.title).toMatch(/^All branches · This month/);
    expect(r.card!.insights.length).toBeGreaterThan(1);
    expect(r.context).toMatchObject({ branch: 'all', intent: 'insights' });
    expect(r.speech.length).toBeGreaterThan(40);

    const k = await svc.chat('Karkala', { ...r.context }, NOW);
    expect(k.card?.title).toMatch(/^Karkala · This month/);
    expect(k.context.intent).toBe('insights');
  });

  it('makes the Excel link for the chosen branch and dates, asking for what is missing', async () => {
    const ask = await svc.chat('Download Excel', undefined, NOW);
    expect(ask.text).toBe('Which branch?');
    const period = await svc.chat('Moodbidri', ask.context, NOW);
    expect(period.text).toBe('Daily, weekly or monthly?');
    const done = await svc.chat('Last month', period.context, NOW);
    expect(done.action).toEqual({ type: 'download', label: 'Download Excel', from: '2026-09-01', to: '2026-09-30', branchId: 'b2' });

    const all = await svc.chat('excel for all branches 1 oct to 10 oct', undefined, NOW);
    expect(all.action).toMatchObject({ from: '2026-10-01', to: '2026-10-10', branchId: null });
  });

  it('handles custom dates, including ones it cannot read', async () => {
    const a = await svc.chat('report', undefined, NOW);
    const b = await svc.chat('All branches', a.context, NOW);
    const c = await svc.chat('Custom dates', b.context, NOW);
    expect(c.context.awaiting).toBe('dates');
    const bad = await svc.chat('whenever', c.context, NOW);
    expect(bad.text).toMatch(/couldn’t read/);
    expect(bad.context.awaiting).toBe('dates');
    const ok = await svc.chat('2026-10-05 to 2026-10-06', bad.context, NOW);
    expect(ok.card?.title).toBe('All branches · 5 – 6 Oct 2026');
    expect(ok.card?.stats.find((s) => s.label === 'Revenue')?.value).toBe('₹3,000');
  });

  it('lets the admin change just the branch or just the period', async () => {
    const r = await svc.chat('karkala this week', undefined, NOW);
    const another = await svc.chat('Another branch', r.context, NOW);
    expect(another.text).toBe('Which branch?');
    expect(another.context.period).toBeDefined();
    const again = await svc.chat('Moodbidri', another.context, NOW);
    expect(again.card?.title).toMatch(/^Moodbidri · This week/);
    const p = await svc.chat('Another period', again.context, NOW);
    expect(p.text).toBe('Daily, weekly or monthly?');
    expect(p.context.branch).toBe('b2');
  });

  it('is honest when there are no bills, greets, and explains itself when it does not understand', async () => {
    const empty = await svc.chat('moodbidri last week', undefined, NOW);
    expect(empty.text).toMatch(/No bills/);
    expect((await svc.chat('hello', undefined, NOW, () => 0)).text).toMatch(/Baron/);
    const lost = await svc.chat('what is the capital of France', undefined, NOW);
    expect(lost.text).toMatch(/I can give a report/);
    expect(lost.chips.length).toBeGreaterThan(2);
  });

  it('does not trust the context it is sent, and never reports the future', async () => {
    const r = await svc.chat('Insights', { branch: 'not-a-branch', period: { from: '2026-12-31', to: '2026-01-01', name: 'x' }, awaiting: 'evil' as any, intent: 'nope' as any }, NOW);
    expect(r.context.branch).toBe('all');
    expect(r.context.awaiting).toBeUndefined();
    const future = await svc.chat('karkala 1 nov to 30 nov', undefined, NOW);
    expect(exporter.model.mock.calls.every((c: any[]) => c[1] <= TODAY || c[0] > TODAY)).toBe(true);
    expect(future).toBeDefined();
  });
});

describe('personality', () => {
  const ctxOf = () => {
    const sessions = [bill('1', '2026-10-12', 'b1', 4000), bill('2', '2026-10-12', 'b2', 1500), bill('3', '2026-10-05', 'b1', 9000), bill('4', '2026-10-05', 'b2', 8000)];
    const exporter: any = {
      model: vi.fn(async (from: string, to: string, branchId?: string) =>
        modelFor(from, to, sessions.filter((s) => { const d = s.closedAt!.toISOString().slice(0, 10); return d >= from && d <= to; }), branchId)),
    };
    const prisma: any = { branch: { findMany: vi.fn().mockResolvedValue(BRANCHES) }, session: { groupBy: vi.fn().mockResolvedValue([{}, {}, {}]) } };
    return new AssistantService(prisma, exporter);
  };

  it('does not always say it the same way, and keeps jokes off the screen text', async () => {
    const svc = ctxOf();
    const speeches = new Set<string>();
    for (const r of [0, 0.34, 0.67, 0.99]) {
      const reply = await svc.chat('insights this week', undefined, NOW, () => r);
      speeches.add(reply.speech);
      // spoken text has no symbols a voice would stumble on
      expect(reply.speech).not.toMatch(/[₹%→]/);
    }
    expect(speeches.size).toBeGreaterThanOrEqual(3);
    const card = (await svc.chat('insights this week', undefined, NOW, () => 0)).card!;
    expect(card.insights.map((i) => i.text).join(' ')).not.toMatch(/Show-off|pep talk|Take a bow/);
  });

  it('is warm on good news and keeps bad news serious', async () => {
    const svc = ctxOf();
    const bad = await svc.chat('insights last week', undefined, new Date('2026-10-12T08:00:00Z'), () => 0);
    expect(bad.speech.length).toBeGreaterThan(60);
    const text = bad.speech.toLowerCase();
    expect(text).not.toMatch(/show-off|take a bow/);
  });
});

describe('natural voice', () => {
  const fetchMock = vi.fn();
  const cfg = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as any;
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });
  const ok = () => fetchMock.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('mp3').buffer });

  it('is off until a key is set, and picks the provider that is configured', () => {
    expect(new TtsService(cfg({})).provider).toBeNull();
    expect(new TtsService(cfg({ OPENAI_API_KEY: 'k' })).provider).toBe('openai');
    expect(new TtsService(cfg({ ELEVENLABS_API_KEY: 'k' })).provider).toBeNull(); // needs a voice id too
    expect(new TtsService(cfg({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' })).provider).toBe('elevenlabs');
    expect(new TtsService(cfg({ TTS_PROVIDER: 'openai', OPENAI_API_KEY: 'k', ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' })).provider).toBe('openai');
    expect(new TtsService(cfg({ TTS_PROVIDER: 'elevenlabs', OPENAI_API_KEY: 'k' })).provider).toBeNull();
  });

  it('asks OpenAI for a male voice with a natural, expressive style, and returns MP3', async () => {
    ok();
    const out = await new TtsService(cfg({ OPENAI_API_KEY: 'sk-secret' })).speak('Revenue is up 12 percent.');
    expect(out.mime).toBe('audio/mpeg');
    expect(out.audio.toString()).toBe('mp3');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.headers.Authorization).toBe('Bearer sk-secret');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'ash', input: 'Revenue is up 12 percent.', response_format: 'mp3' });
    expect(body.instructions).toBe(VOICE_STYLE);
    expect(VOICE_STYLE).toMatch(/never like a machine/);
    expect(VOICE_STYLE).toMatch(/witty/);
  });

  it('can use ElevenLabs instead', async () => {
    ok();
    await new TtsService(cfg({ ELEVENLABS_API_KEY: 'xk', ELEVENLABS_VOICE_ID: 'voice/1' })).speak('Hello boss');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%2F1?output_format=mp3_44100_128');
    expect(init.headers['xi-api-key']).toBe('xk');
    expect(JSON.parse(init.body)).toMatchObject({ text: 'Hello boss', model_id: 'eleven_multilingual_v2' });
  });

  it('explains why when ElevenLabs refuses (like a free plan using a library voice), without leaking the key', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ detail: { message: 'Free users cannot use library voices via the API. Add $5 of credits: https://elevenlabs.io/app' } }),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const err = await new TtsService(cfg({ ELEVENLABS_API_KEY: 'xk-secret', ELEVENLABS_VOICE_ID: 'v' })).speak('hi').catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(err.message).toMatch(/^ElevenLabs said 402: Free users cannot use library voices/);
    expect(err.message).not.toMatch(/xk-secret|https?:/);
  });

  it('uses the newest ElevenLabs models without the old expressiveness settings', async () => {
    ok();
    await new TtsService(cfg({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_MODEL: 'eleven_v4' })).speak('Hello');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model_id: 'eleven_v4', language_code: 'en' });
    expect(body.voice_settings).toBeUndefined();
  });

  it('pays for the same sentence once, trims long text, and never leaks the key in errors', async () => {
    ok();
    const tts = new TtsService(cfg({ OPENAI_API_KEY: 'sk-secret' }));
    await tts.speak('Good evening!');
    await tts.speak('Good evening!');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tts.speak('x'.repeat(5000));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).input.length).toBe(900);

    fetchMock.mockResolvedValue({ ok: false, status: 401, arrayBuffer: async () => new ArrayBuffer(0) });
    const err = await new TtsService(cfg({ OPENAI_API_KEY: 'sk-secret' })).speak('hi').catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(String(err.message)).not.toMatch(/sk-secret/);
    fetchMock.mockRejectedValue(new Error('network down sk-secret'));
    const err2 = await new TtsService(cfg({ OPENAI_API_KEY: 'sk-secret' })).speak('hello again').catch((e) => e);
    expect(err2).toBeInstanceOf(BadGatewayException);
    expect(String(err2.message)).not.toMatch(/sk-secret/);
    await expect(new TtsService(cfg({})).speak('hi')).rejects.toThrow(ServiceUnavailableException);
  });
});
