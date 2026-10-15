import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhatsappClient } from './whatsapp.client.js';
import { WhatsappOffers } from './whatsapp.offers.js';
import { WhatsappOutbox } from './whatsapp.outbox.js';
import { WhatsappReports } from './whatsapp.reports.js';
import { cleanTimes, WhatsappSettings } from './whatsapp.settings.js';
import { WhatsappSuppression } from './whatsapp.suppression.js';
import { WhatsappWebhook } from './whatsapp.webhook.js';
import { toWhatsappNumber } from './whatsapp.format.js';
import { ReportExport, reportRange } from './report-export.js';
import { XLSX_MIME } from './report-xlsx.js';

class ReportTimesDto {
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use a time like 21:30.' }) dailyTime!: string;
  @IsInt() @Min(0) @Max(6) weeklyDay!: number;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use a time like 09:00.' }) weeklyTime!: string;
  @IsInt() @Min(1) @Max(28) monthlyDay!: number;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use a time like 09:00.' }) monthlyTime!: string;
}

class SaveReportSettingsDto {
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  phones!: string[];

  @IsBoolean() daily!: boolean;
  @IsBoolean() weekly!: boolean;
  @IsBoolean() monthly!: boolean;
  /** Send the full Excel report with each report message. */
  @IsOptional() @IsBoolean() excel?: boolean;

  /** When each report goes out (Indian time). Left out: keep what is saved. */
  @IsOptional() @ValidateNested() @Type(() => ReportTimesDto) times?: ReportTimesDto;

  /** How bills are sent: off, automatically through the Business API, or by hand from the staff app. */
  @IsIn(['off', 'api', 'manual']) mode!: 'off' | 'api' | 'manual';
  @IsIn(['text', 'image']) billFormat!: 'text' | 'image';
}

class TestReportDto {
  /** First day (YYYY-MM-DD, Indian time). Defaults to today. */
  @IsOptional() @IsString() @MaxLength(10) from?: string;
  @IsOptional() @IsString() @MaxLength(10) to?: string;
}

class SendOfferDto {
  @IsString() @MaxLength(1000) message!: string;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  /** Branches to send to; empty means every branch. */
  @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) branchIds!: string[];
}

/** 10-digit view of a stored 91XXXXXXXXXX number. */
const display = (n: string) => (n.startsWith('91') && n.length === 12 ? n.slice(2) : n);
/** 98XXXXX210 style masking for the message log. */
const mask = (n: string) => `${display(n).slice(0, 2)}••••••${display(n).slice(-2)}`;

@ApiTags('Admin WhatsApp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/whatsapp')
export class WhatsappController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly outbox: WhatsappOutbox,
    private readonly reports: WhatsappReports,
    private readonly settings: WhatsappSettings,
    private readonly offers: WhatsappOffers,
    private readonly exporter: ReportExport,
    private readonly suppression: WhatsappSuppression,
    private readonly webhook: WhatsappWebhook,
  ) {}

  @Get()
  @ApiOperation({ summary: 'WhatsApp status and who receives the reports' })
  async status() {
    const [s, delivery, pause, suppressed, offersToday] = await Promise.all([
      this.settings.get(),
      this.settings.getDelivery(),
      this.settings.getPause(),
      this.suppression.counts(),
      this.outbox.offersSentInLastDay(),
    ]);
    return {
      paused: pause.all ?? pause.offers ?? null,
      pausedScope: pause.all ? 'all' : pause.offers ? 'offers' : null,
      webhookReady: this.webhook.secretConfigured && this.webhook.verifyTokenConfigured,
      suppressed,
      offerLimit: { perDay: this.outbox.offerDailyLimit, sentToday: offersToday, minDaysBetween: this.offers.minDaysBetween },
      configured: this.client.isConfigured(),
      mode: delivery.mode,
      billFormat: delivery.billFormat,
      phones: s.phones.map(display),
      daily: s.daily,
      weekly: s.weekly,
      monthly: s.monthly,
      excel: s.excel,
      times: s.times,
      templates: this.client.templates,
    };
  }

  @Put()
  @ApiOperation({ summary: 'Choose the numbers and which reports are sent' })
  async save(@Body() dto: SaveReportSettingsDto) {
    const phones: string[] = [];
    for (const raw of dto.phones.filter((p) => p.trim() !== '')) {
      const n = toWhatsappNumber(raw);
      if (!n) throw new BadRequestException(`"${raw}" is not a valid mobile number.`);
      if (!phones.includes(n)) phones.push(n);
    }
    await this.settings.save({ phones, daily: dto.daily, weekly: dto.weekly, monthly: dto.monthly, excel: dto.excel !== false, times: cleanTimes(dto.times ?? (await this.settings.get()).times) });
    await this.settings.saveDelivery({ mode: dto.mode, billFormat: dto.billFormat });
    return this.status();
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a "today so far" report now to check the setup' })
  async test(@Body() dto: TestReportDto) {
    if (!this.client.isConfigured()) {
      throw new BadRequestException('WhatsApp is not set up on the server yet (see the setup guide).');
    }
    if ((await this.settings.getDelivery()).mode !== 'api') {
      throw new BadRequestException('Switch on "Automatic" to send reports.');
    }
    const s = await this.settings.get();
    if (s.phones.length === 0) throw new BadRequestException('Add a WhatsApp number first.');
    const queued = await this.reports.sendTest(dto?.from, dto?.to);
    await this.outbox.flush();
    return { queued };
  }

  @Get('report')
  @ApiOperation({ summary: 'Download the Excel report for a period (defaults to today), without sending anything' })
  async downloadReport(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Res() res: Response) {
    const range = reportRange(from, to);
    const { file, fileName } = await this.exporter.generate(range.from, range.to);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.type(XLSX_MIME).send(file);
  }

  @Get('offers/audience')
  @ApiOperation({ summary: 'How many customers an offer to these branches would reach, and who is left out' })
  async audience(@Query('branchIds') branchIds?: string) {
    const ids = (branchIds ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const { count, optedOut, recentlyMessaged } = await this.offers.audience(ids);
    return { count, optedOut, recentlyMessaged };
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume sending after a pause (once the cause is fixed)' })
  async resume() {
    await this.settings.resume();
    void this.outbox.flush();
    return { resumed: true };
  }

  @Post('offers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send an offer (message and optional picture) to customers on WhatsApp' })
  sendOffer(@Body() dto: SendOfferDto) {
    return this.offers.send(dto);
  }

  @Get('offers')
  @ApiOperation({ summary: 'Recent offers and how many messages were sent / failed' })
  async listOffers() {
    return { data: await this.offers.list() };
  }

  @Post('messages/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Try again the messages from the last 24 hours that failed' })
  async retry() {
    return { requeued: await this.outbox.retryFailed() };
  }

  @Get('messages')
  @ApiOperation({ summary: 'The most recent WhatsApp messages and whether they were delivered to WhatsApp' })
  async messages() {
    const rows = await this.prisma.whatsappMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 25 });
    return {
      data: rows.map((m) => ({
        id: m.id,
        kind: m.kind,
        status: m.status,
        to: mask(m.to),
        attempts: m.attempts,
        error: m.lastError,
        errorCode: m.errorCode,
        deliveryStatus: m.deliveryStatus,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
        createdAt: m.createdAt,
        sentAt: m.sentAt,
      })),
    };
  }
}
