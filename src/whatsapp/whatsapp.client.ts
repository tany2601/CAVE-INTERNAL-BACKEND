import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classifyError } from './whatsapp.policy.js';

/** The picture or document shown above a template message: an uploaded media id, or a public link. */
export interface TemplateHeader {
  id?: string;
  link?: string;
  /** Defaults to an image. */
  kind?: 'image' | 'document';
  /** File name shown to the reader (documents). */
  filename?: string;
}

export class WhatsappSendError extends Error {
  /** True when trying again later may work (network trouble, rate limits, server errors). */
  constructor(
    message: string,
    readonly retryable: boolean,
    /** WhatsApp's error code, when it gave one. */
    readonly code?: number,
  ) {
    super(message);
  }
}

/** Thin client for the WhatsApp Business Cloud API (Meta). Only template messages are sent. */
@Injectable()
export class WhatsappClient {
  private readonly logger = new Logger('WhatsApp');

  constructor(private readonly config: ConfigService) {}

  get templates() {
    return {
      bill: this.config.get<string>('WHATSAPP_BILL_TEMPLATE') || 'cave_bill',
      report: this.config.get<string>('WHATSAPP_REPORT_TEMPLATE') || 'cave_report',
      billImage: this.config.get<string>('WHATSAPP_BILL_IMAGE_TEMPLATE') || 'cave_bill_image',
      offer: this.config.get<string>('WHATSAPP_OFFER_TEMPLATE') || 'cave_offer',
      offerImage: this.config.get<string>('WHATSAPP_OFFER_IMAGE_TEMPLATE') || 'cave_offer_image',
      reportFile: this.config.get<string>('WHATSAPP_REPORT_FILE_TEMPLATE') || 'cave_report_file',
    };
  }

  /** Sending is on only when the access token and phone number id are both set. */
  isConfigured(): boolean {
    return !!this.config.get<string>('WHATSAPP_TOKEN') && !!this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
  }

  /** Uploads a picture to WhatsApp and returns its media id (valid for 30 days), for use in a template header. */
  uploadImage(png: Buffer, filename = 'bill.png'): Promise<string> {
    return this.uploadMedia(png, 'image/png', filename);
  }

  /** Uploads a file (picture or document) to WhatsApp and returns its media id, valid for 30 days. */
  async uploadMedia(file: Buffer, mime: string, filename: string): Promise<string> {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneId) throw new WhatsappSendError('WhatsApp is not configured.', false);
    const base = this.config.get<string>('WHATSAPP_API_BASE') || 'https://graph.facebook.com';
    const version = this.config.get<string>('WHATSAPP_API_VERSION') || 'v21.0';
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([new Uint8Array(file)], { type: mime }), filename);
    let res: Response;
    try {
      res = await fetch(`${base}/${version}/${phoneId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new WhatsappSendError(`Could not reach WhatsApp: ${(e as Error).message}`, true);
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (res.ok && body.id) return body.id;
    throw new WhatsappSendError(body.error?.message ?? `Image upload failed (HTTP ${res.status})`, res.status === 429 || res.status >= 500);
  }

  async sendTemplate(
    to: string,
    template: string,
    params: string[],
    header?: TemplateHeader | null,
  ): Promise<{ id: string | null }> {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneId) throw new WhatsappSendError('WhatsApp is not configured.', false);
    const version = this.config.get<string>('WHATSAPP_API_VERSION') || 'v21.0';
    const language = this.config.get<string>('WHATSAPP_TEMPLATE_LANG') || 'en';

    let res: Response;
    try {
      const base = this.config.get<string>('WHATSAPP_API_BASE') || 'https://graph.facebook.com';
      res = await fetch(`${base}/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [
              ...(header && (header.id || header.link)
                ? [
                    {
                      type: 'header',
                      parameters: [
                        header.kind === 'document'
                          ? { type: 'document', document: { ...(header.id ? { id: header.id } : { link: header.link }), filename: header.filename } }
                          : { type: 'image', image: header.id ? { id: header.id } : { link: header.link } },
                      ],
                    },
                  ]
                : []),
              { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
            ],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new WhatsappSendError(`Could not reach WhatsApp: ${(e as Error).message}`, true);
    }

    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (res.ok) return { id: body.messages?.[0]?.id ?? null };

    // The token is never logged; Meta's own error text is.
    const reason = body.error?.message ?? `HTTP ${res.status}`;
    this.logger.warn(`Send to ${to.slice(0, 5)}… failed (${res.status}${body.error?.code ? `, code ${body.error.code}` : ''}): ${reason}`);
    throw new WhatsappSendError(reason, classifyError(body.error?.code, res.status).retryable, body.error?.code);
  }

  /**
   * A plain text reply. WhatsApp only allows this within 24 hours of the customer's last message, so it
   * is used for one thing: confirming a STOP / START the customer just sent. Never throws.
   */
  async sendText(to: string, text: string): Promise<void> {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneId) return;
    const base = this.config.get<string>('WHATSAPP_API_BASE') || 'https://graph.facebook.com';
    const version = this.config.get<string>('WHATSAPP_API_VERSION') || 'v21.0';
    try {
      const res = await fetch(`${base}/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) this.logger.warn(`Reply to ${to.slice(0, 5)}… failed (${res.status})`);
    } catch (e) {
      this.logger.warn(`Reply failed: ${(e as Error).message}`);
    }
  }
}
