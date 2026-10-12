/**
 * Rules that keep the WhatsApp number in good standing: how to react to each WhatsApp error code,
 * and how to read a customer's reply as "stop" or "start". Pure functions, no I/O.
 */

export type PauseScope = 'all' | 'offers';

export interface ErrorPolicy {
  /** Worth sending this message again later. */
  retryable: boolean;
  /** Stop sending for a while (the problem is the account, not this one message). */
  pause?: { scope: PauseScope; minutes: number; reason: string };
  /** Never message this number again (until it expires or the customer says START). */
  suppress?: 'UNDELIVERABLE' | 'STOP';
}

/**
 * What to do after WhatsApp refuses a message. `code` is the Meta error code (undefined for network errors).
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export function classifyError(code: number | undefined, status: number): ErrorPolicy {
  switch (code) {
    case 190: // access token expired / invalid
    case 10: // permission denied
    case 200:
      return { retryable: false, pause: { scope: 'all', minutes: 30, reason: 'WhatsApp rejected the access token. Generate a new token, update the server, then press Resume.' } };
    case 131031: // account locked
      return { retryable: false, pause: { scope: 'all', minutes: 60, reason: 'WhatsApp has locked the account. Check Meta Business Support, then press Resume.' } };
    case 368: // temporarily blocked for policy violations
      return { retryable: false, pause: { scope: 'all', minutes: 360, reason: 'WhatsApp has temporarily blocked sending for a policy violation. Check the account quality in Meta, then press Resume.' } };
    case 130429: // throughput limit
      return { retryable: true, pause: { scope: 'all', minutes: 5, reason: 'WhatsApp asked us to slow down. Sending resumes by itself.' } };
    case 80007: // WABA rate limit
      return { retryable: true, pause: { scope: 'all', minutes: 10, reason: 'WhatsApp rate limit reached. Sending resumes by itself.' } };
    case 131048: // spam rate limit hit
      return { retryable: false, pause: { scope: 'offers', minutes: 24 * 60, reason: 'WhatsApp limited the number for sending too many unwanted messages. Offers are paused for 24 hours to protect it.' } };
    case 131056: // too many messages to this one number
      return { retryable: true };
    case 131026: // not on WhatsApp / can't receive
      return { retryable: false, suppress: 'UNDELIVERABLE' };
    case 131050: // customer opted out of marketing
      return { retryable: false, suppress: 'STOP' };
    case 131049: // WhatsApp chose not to deliver a marketing message (engagement)
      return { retryable: false };
    default:
      return { retryable: status === 429 || status >= 500 };
  }
}

const STOP_EXACT = new Set(['STOP', 'STOP ALL', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'OPT OUT']);
const START_EXACT = new Set(['START', 'UNSTOP', 'SUBSCRIBE', 'OPTIN', 'OPT IN']);

const normalise = (text: string) =>
  text
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "STOP", "stop!", "Please unsubscribe me" → 'stop'; "START" → 'start'; anything else → null. */
export function readReply(text: string | undefined | null): 'stop' | 'start' | null {
  if (!text) return null;
  const t = normalise(text);
  if (!t || t.length > 60) return null;
  if (START_EXACT.has(t)) return 'start';
  if (STOP_EXACT.has(t) || /^(STOP|UNSUBSCRIBE)\b/.test(t) || /\bUNSUBSCRIBE( ME)?$/.test(t)) return 'stop';
  return null;
}

/** An UNDELIVERABLE mark is only trusted for this long: people do join WhatsApp later. */
export const UNDELIVERABLE_DAYS = 30;

/** Forward-only delivery progress: a late "delivered" can't undo "read". */
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
export const isProgress = (current: string | null | undefined, next: string) => (RANK[next] ?? 0) > (RANK[current ?? ''] ?? 0);
