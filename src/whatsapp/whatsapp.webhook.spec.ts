import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WhatsappWebhook, WebhookPayload } from './whatsapp.webhook.js';
import { WhatsappWebhookController } from './whatsapp.webhook.controller.js';
import { classifyError, isProgress, readReply } from './whatsapp.policy.js';

const SECRET = 'app-secret-for-tests';
const sign = (body: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('reading customer replies', () => {
  it('understands stop and start in everyday wording, and ignores everything else', () => {
    for (const t of ['STOP', 'stop', ' Stop! ', 'Unsubscribe', 'please unsubscribe me', 'STOP ALL', 'stop sending me messages', 'Cancel']) expect(readReply(t)).toBe('stop');
    for (const t of ['START', 'start', 'Unstop', 'subscribe']) expect(readReply(t)).toBe('start');
    // "do not stop..." and "stopwatch" must not be mistaken for an opt-out
    for (const t of ['thanks!', 'what time do you open?', 'do not stop the offers', 'stopwatch sale', '', undefined, null, 'x'.repeat(100)]) {
      expect(readReply(t as string)).toBeNull();
    }
  });

  it('only ever moves a delivery forward', () => {
    expect(isProgress(null, 'delivered')).toBe(true);
    expect(isProgress('delivered', 'read')).toBe(true);
    expect(isProgress('read', 'delivered')).toBe(false);
    expect(isProgress('delivered', 'delivered')).toBe(false);
  });

  it('knows how to react to WhatsApp error codes', () => {
    expect(classifyError(190, 401)).toMatchObject({ retryable: false, pause: { scope: 'all' } });
    expect(classifyError(131048, 400)).toMatchObject({ pause: { scope: 'offers', minutes: 1440 } });
    expect(classifyError(131026, 400)).toMatchObject({ retryable: false, suppress: 'UNDELIVERABLE' });
    expect(classifyError(131050, 400)).toMatchObject({ suppress: 'STOP' });
    expect(classifyError(131056, 400)).toMatchObject({ retryable: true });
    expect(classifyError(undefined, 503)).toMatchObject({ retryable: true });
    expect(classifyError(132001, 404)).toMatchObject({ retryable: false });
  });
});

describe('WhatsApp webhook', () => {
  let prisma: any;
  let client: any;
  let suppression: any;
  let settings: any;
  let webhook: WhatsappWebhook;
  let msg: any;
  const config = (over: Record<string, string> = {}) => ({ get: (k: string) => ({ WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: 'verify-me', ...over })[k] }) as any;

  beforeEach(() => {
    msg = { id: 'm1', to: '919876543210', providerMessageId: 'wamid.1', deliveryStatus: null, deliveredAt: null };
    prisma = {
      whatsappMessage: {
        findFirst: vi.fn(async ({ where }: any) => (where.providerMessageId === 'wamid.1' ? msg : null)),
        update: vi.fn(async ({ data }: any) => Object.assign(msg, data)),
      },
    };
    client = { sendText: vi.fn().mockResolvedValue(undefined) };
    suppression = { add: vi.fn().mockResolvedValue(true), lift: vi.fn().mockResolvedValue(true) };
    settings = { pause: vi.fn() };
    webhook = new WhatsappWebhook(prisma, config(), client, suppression, settings);
  });

  const payload = (value: object): WebhookPayload => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value }] }] });

  it('answers the setup handshake only with the right token', () => {
    expect(webhook.verifyHandshake('subscribe', 'verify-me')).toBe(true);
    expect(webhook.verifyHandshake('subscribe', 'wrong')).toBe(false);
    expect(webhook.verifyHandshake('unsubscribe', 'verify-me')).toBe(false);
    expect(webhook.verifyHandshake('subscribe', undefined)).toBe(false);
    expect(new WhatsappWebhook(prisma, config({ WHATSAPP_VERIFY_TOKEN: '' }), client, suppression, settings).verifyHandshake('subscribe', '')).toBe(false);
  });

  it('accepts only bodies signed with the app secret', () => {
    const body = Buffer.from('{"a":1}');
    expect(webhook.validSignature(body, sign('{"a":1}'))).toBe(true);
    expect(webhook.validSignature(body, sign('{"a":2}'))).toBe(false);
    expect(webhook.validSignature(body, sign('{"a":1}', 'other-secret'))).toBe(false);
    expect(webhook.validSignature(body, undefined)).toBe(false);
    expect(webhook.validSignature(body, 'sha256=short')).toBe(false);
    expect(webhook.validSignature(body, sign('{"a":1}').replace('sha256=', ''))).toBe(false);
    expect(webhook.validSignature(undefined, sign('{"a":1}'))).toBe(false);
    expect(new WhatsappWebhook(prisma, config({ WHATSAPP_APP_SECRET: '' }), client, suppression, settings).validSignature(body, sign('{"a":1}', ''))).toBe(false);
  });

  it('records delivered and read, once, in order', async () => {
    await webhook.handle(payload({ statuses: [{ id: 'wamid.1', status: 'delivered' }] }));
    expect(msg).toMatchObject({ deliveryStatus: 'delivered' });
    expect(msg.deliveredAt).toBeInstanceOf(Date);
    await webhook.handle(payload({ statuses: [{ id: 'wamid.1', status: 'read' }] }));
    expect(msg.deliveryStatus).toBe('read');
    expect(msg.readAt).toBeInstanceOf(Date);
    prisma.whatsappMessage.update.mockClear();
    await webhook.handle(payload({ statuses: [{ id: 'wamid.1', status: 'delivered' }] })); // late / repeated
    expect(prisma.whatsappMessage.update).not.toHaveBeenCalled();
    expect(msg.deliveryStatus).toBe('read');
  });

  it('marks a message failed after acceptance and stops messaging a number that is not on WhatsApp', async () => {
    await webhook.handle(payload({ statuses: [{ id: 'wamid.1', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] }] }));
    expect(msg).toMatchObject({ status: 'FAILED', deliveryStatus: 'failed', errorCode: 131026 });
    expect(suppression.add).toHaveBeenCalledWith('919876543210', 'UNDELIVERABLE');
  });

  it('ignores receipts for messages that are not ours', async () => {
    const res = await webhook.handle(payload({ statuses: [{ id: 'wamid.unknown', status: 'read' }] }));
    expect(res).toEqual({ statuses: 0, replies: 0 });
  });

  it('opts a customer out on STOP, confirms once, and lifts it on START', async () => {
    await webhook.handle(payload({ messages: [{ from: '919876543210', type: 'text', text: { body: 'STOP' } }] }));
    expect(suppression.add).toHaveBeenCalledWith('919876543210', 'STOP');
    expect(client.sendText).toHaveBeenCalledTimes(1);
    expect(client.sendText.mock.calls[0][1]).toMatch(/won't get offers/);

    suppression.add.mockResolvedValue(false); // WhatsApp delivers the same event again
    await webhook.handle(payload({ messages: [{ from: '919876543210', type: 'text', text: { body: 'stop' } }] }));
    expect(client.sendText).toHaveBeenCalledTimes(1); // no second confirmation

    await webhook.handle(payload({ messages: [{ from: '919876543210', type: 'text', text: { body: 'START' } }] }));
    expect(suppression.lift).toHaveBeenCalledWith('919876543210');
    expect(client.sendText).toHaveBeenCalledTimes(2);
  });

  it('reads the Stop button on a marketing message, and ignores ordinary chat', async () => {
    await webhook.handle(payload({ messages: [{ from: '919000000001', type: 'button', button: { text: 'Stop promotions' } }] }));
    expect(suppression.add).toHaveBeenCalledWith('919000000001', 'STOP');
    suppression.add.mockClear();
    await webhook.handle(payload({ messages: [{ from: '919000000001', type: 'text', text: { body: 'Is the salon open tomorrow?' } }] }));
    expect(suppression.add).not.toHaveBeenCalled();
  });

  it('ignores payloads for other products', async () => {
    expect(await webhook.handle({ object: 'page', entry: [] })).toEqual({ statuses: 0, replies: 0 });
  });

  describe('endpoint', () => {
    const body = JSON.stringify(payload({ statuses: [{ id: 'wamid.1', status: 'read' }] }));
    const req = (sig: string | undefined, raw: Buffer | undefined = Buffer.from(body)) =>
      ({ rawBody: raw, body: JSON.parse(body), get: (h: string) => (h === 'x-hub-signature-256' ? sig : undefined) }) as any;

    it('rejects forged, unsigned and unsigned-by-us requests, and processes real ones', async () => {
      const c = new WhatsappWebhookController(webhook);
      await expect(c.receive(req(undefined))).rejects.toThrow(UnauthorizedException);
      await expect(c.receive(req(sign(body, 'attacker')))).rejects.toThrow(UnauthorizedException);
      await expect(c.receive(req(sign(body), Buffer.from(body + ' ')))).rejects.toThrow(UnauthorizedException); // body tampered
      expect(msg.deliveryStatus).toBeNull();
      expect(await c.receive(req(sign(body)))).toEqual({ ok: true });
      expect(msg.deliveryStatus).toBe('read');
    });

    it('refuses everything while no app secret is set (fails closed)', async () => {
      const c = new WhatsappWebhookController(new WhatsappWebhook(prisma, config({ WHATSAPP_APP_SECRET: '' }), client, suppression, settings));
      await expect(c.receive(req(sign(body, '')))).rejects.toThrow(ServiceUnavailableException);
    });

    it('verifies the handshake and echoes the challenge', () => {
      const c = new WhatsappWebhookController(webhook);
      expect(c.verify('subscribe', 'verify-me', '12345')).toBe('12345');
      expect(() => c.verify('subscribe', 'nope', '12345')).toThrow(ForbiddenException);
    });
  });
});
