import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { toWhatsappNumber } from './whatsapp.format.js';

/** When the scheduled reports go out (Indian time). */
export interface ReportTimes {
  /** "HH:MM", 24-hour. The daily report is for that day, sent from this time. */
  dailyTime: string;
  /** 0 = Sunday … 6 = Saturday. The weekly report covers the 7 days before that day. */
  weeklyDay: number;
  weeklyTime: string;
  /** 1–28. The monthly report is for the month before, sent from this day. */
  monthlyDay: number;
  monthlyTime: string;
}

export const DEFAULT_TIMES: ReportTimes = { dailyTime: '21:30', weeklyDay: 1, weeklyTime: '09:00', monthlyDay: 1, monthlyTime: '09:00' };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The saved or submitted times, with anything missing or invalid replaced by the standard schedule. */
export function cleanTimes(v?: Partial<ReportTimes> | null): ReportTimes {
  const time = (x: unknown, fallback: string) => (typeof x === 'string' && HHMM.test(x) ? x : fallback);
  const int = (x: unknown, lo: number, hi: number, fallback: number) => {
    const n = Number(x);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
  };
  return {
    dailyTime: time(v?.dailyTime, DEFAULT_TIMES.dailyTime),
    weeklyDay: int(v?.weeklyDay, 0, 6, DEFAULT_TIMES.weeklyDay),
    weeklyTime: time(v?.weeklyTime, DEFAULT_TIMES.weeklyTime),
    monthlyDay: int(v?.monthlyDay, 1, 28, DEFAULT_TIMES.monthlyDay),
    monthlyTime: time(v?.monthlyTime, DEFAULT_TIMES.monthlyTime),
  };
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface ReportSettings {
  /** WhatsApp numbers (country code + number) that receive the reports. */
  phones: string[];
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  /** Send the full Excel report with the message (needs the cave_report_file template). */
  excel: boolean;
  times: ReportTimes;
}

const KEY = 'whatsapp.reports';
const MODE_KEY = 'whatsapp.mode';
const PAUSE_KEY = 'whatsapp.pause';

/**
 * How customer bills are sent. One setting, so the two ways can never be on together:
 *  · off:    nothing is sent
 *  · api:    the server sends the bill (and the admin reports) through the WhatsApp Business API
 *  · manual: staff tap a button after billing and WhatsApp opens with the bill filled in
 */
export interface PauseInfo {
  /** When sending may resume by itself. */
  until: string;
  reason: string;
}

/** Sending can be paused for everything, or only for offers (marketing). */
export interface PauseState {
  all?: PauseInfo;
  offers?: PauseInfo;
}

export type WhatsappMode = 'off' | 'api' | 'manual';
export type BillFormat = 'text' | 'image';

export interface DeliverySettings {
  mode: WhatsappMode;
  /** "image": the bill as a branded picture with the details as its caption; "text": a plain message. */
  billFormat: BillFormat;
}

@Injectable()
export class WhatsappSettings {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private deliveryCache?: { at: number; value: DeliverySettings };

  /**
   * How bills are sent. Before the admin has chosen, an installation that already has WhatsApp keys
   * keeps sending automatically and one without stays off. Cached briefly because every dashboard
   * refresh asks for it.
   */
  async getDelivery(): Promise<DeliverySettings> {
    if (this.deliveryCache && Date.now() - this.deliveryCache.at < 15_000) return this.deliveryCache.value;
    const row = await this.prisma.appSetting.findUnique({ where: { key: MODE_KEY } });
    const v = (row?.value ?? {}) as Partial<DeliverySettings>;
    const hasKeys = !!this.config.get<string>('WHATSAPP_TOKEN') && !!this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const mode: WhatsappMode = v.mode === 'api' || v.mode === 'manual' || v.mode === 'off' ? v.mode : hasKeys ? 'api' : 'off';
    const value: DeliverySettings = { mode, billFormat: v.billFormat === 'image' ? 'image' : 'text' };
    this.deliveryCache = { at: Date.now(), value };
    return value;
  }

  async saveDelivery(value: DeliverySettings): Promise<DeliverySettings> {
    await this.prisma.appSetting.upsert({
      where: { key: MODE_KEY },
      create: { key: MODE_KEY, value: value as never },
      update: { value: value as never },
    });
    this.deliveryCache = { at: Date.now(), value };
    return value;
  }

  /** Saved settings, or (before anything is saved) the ADMIN_WHATSAPP numbers with every report on. */
  async get(): Promise<ReportSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    if (row) {
      const v = row.value as Partial<ReportSettings>;
      return {
        phones: Array.isArray(v.phones) ? v.phones.filter((p): p is string => typeof p === 'string') : [],
        daily: v.daily !== false,
        weekly: v.weekly !== false,
        monthly: v.monthly !== false,
        excel: v.excel !== false,
        times: cleanTimes(v.times),
      };
    }
    const fromEnv = (this.config.get<string>('ADMIN_WHATSAPP') ?? '')
      .split(',')
      .map((p) => toWhatsappNumber(p))
      .filter((p): p is string => !!p);
    return { phones: fromEnv, daily: true, weekly: true, monthly: true, excel: true, times: DEFAULT_TIMES };
  }

  async save(settings: ReportSettings): Promise<ReportSettings> {
    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: settings as never },
      update: { value: settings as never },
    });
    return settings;
  }

  /** Pauses that are still running (expired ones are ignored). */
  async getPause(now: Date = new Date()): Promise<PauseState> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: PAUSE_KEY } });
    const v = (row?.value ?? {}) as PauseState;
    const live = (p?: PauseInfo) => (p && Date.parse(p.until) > now.getTime() ? p : undefined);
    return { all: live(v.all), offers: live(v.offers) };
  }

  /** Stops sending for `minutes` (never shortens a longer pause that is already running). */
  async pause(scope: 'all' | 'offers', minutes: number, reason: string, now: Date = new Date()): Promise<void> {
    const current = await this.getPause(now);
    const until = new Date(now.getTime() + minutes * 60_000);
    const existing = current[scope];
    if (existing && Date.parse(existing.until) >= until.getTime()) return;
    const next: PauseState = { ...current, [scope]: { until: until.toISOString(), reason } };
    await this.prisma.appSetting.upsert({
      where: { key: PAUSE_KEY },
      create: { key: PAUSE_KEY, value: next as never },
      update: { value: next as never },
    });
  }

  /** The admin pressed Resume after fixing the cause. */
  async resume(): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key: PAUSE_KEY },
      create: { key: PAUSE_KEY, value: {} as never },
      update: { value: {} as never },
    });
  }
}
