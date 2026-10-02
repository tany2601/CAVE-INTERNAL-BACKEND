import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum SummaryPeriod {
  TODAY = 'TODAY',
  THIS_WEEK = 'THIS_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  ALL_TIME = 'ALL_TIME',
}

export class TransactionsSummaryQueryDto {
  @ApiPropertyOptional({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Filter transaction summary by branch UUID (aggregates all branches if omitted)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'branchId must be a valid UUID v4.' })
  branchId?: string;

  @ApiPropertyOptional({
    enum: SummaryPeriod,
    example: 'THIS_MONTH',
    default: SummaryPeriod.THIS_MONTH,
    description: 'Summary time period (TODAY, THIS_WEEK, THIS_MONTH, or ALL_TIME)',
  })
  @IsOptional()
  @IsEnum(SummaryPeriod, {
    message: 'period must be TODAY, THIS_WEEK, THIS_MONTH, or ALL_TIME.',
  })
  period: SummaryPeriod = SummaryPeriod.THIS_MONTH;
}
