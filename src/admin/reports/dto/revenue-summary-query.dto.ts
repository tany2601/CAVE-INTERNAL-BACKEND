import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const PERIODS = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'ALL_TIME', 'CUSTOM'] as const;

export class RevenueSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Limit to one branch (all branches if omitted)' })
  @IsOptional()
  @IsUUID('4', { message: 'branchId must be a valid UUID v4.' })
  branchId?: string;

  @ApiPropertyOptional({ enum: PERIODS, default: 'THIS_MONTH' })
  @IsOptional()
  @IsIn(PERIODS, {
    message: 'period must be TODAY, THIS_WEEK, THIS_MONTH, ALL_TIME or CUSTOM.',
  })
  period: (typeof PERIODS)[number] = 'THIS_MONTH';

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a date as YYYY-MM-DD.' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be a date as YYYY-MM-DD.' })
  to?: string;
}
