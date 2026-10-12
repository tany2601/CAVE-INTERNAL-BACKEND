import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ReportExport, reportRange } from '../whatsapp/report-export.js';
import { XLSX_MIME } from '../whatsapp/report-xlsx.js';
import { ASSISTANT_NAME, AssistantService } from './assistant.service.js';
import type { AssistantContext } from './intent.js';
import { MAX_SPEECH_CHARS, TtsService } from './tts.service.js';

class ChatDto {
  @IsString() @MinLength(1) @MaxLength(300) message!: string;
  /** What the assistant said it was waiting for, and the choices so far. Validated by the service. */
  @IsOptional() @IsObject() context?: AssistantContext;
}

class SpeakDto {
  @IsString() @MinLength(1) @MaxLength(MAX_SPEECH_CHARS) text!: string;
}

@ApiTags('Admin assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly tts: TtsService,
    private readonly exporter: ReportExport,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'The assistant’s name and whether a natural (neural) voice is available' })
  status() {
    return { name: ASSISTANT_NAME, neuralVoice: this.tts.provider !== null };
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the assistant for a report, insights or an Excel sheet' })
  chat(@Body() dto: ChatDto) {
    return this.assistant.chat(dto.message, dto.context);
  }

  @Get('report')
  @ApiOperation({ summary: 'Excel report for one branch (or all) over any dates' })
  async report(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Res() res: Response,
  ) {
    const range = reportRange(from, to);
    const id = branchId && /^[0-9a-f-]{36}$/i.test(branchId) ? branchId : undefined;
    const { file, fileName } = await this.exporter.generate(range.from, range.to, id);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.type(XLSX_MIME).send(file);
  }

  @Post('speak')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The assistant’s answer as natural speech (MP3)' })
  async speak(@Body() dto: SpeakDto, @Res() res: Response) {
    const { audio, mime } = await this.tts.speak(dto.text);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(mime).send(audio);
  }
}
