import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const PERIODS = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'ALL_TIME', 'CUSTOM'] as const;
export type PeriodValue = (typeof PERIODS)[number];

export class ReportRangeQueryDto {
  @ApiPropertyOptional({ description: 'Limit to one branch (all branches if omitted)' })
  @IsOptional()
  @IsUUID('4', { message: 'branchId must be a valid UUID v4.' })
  branchId?: string;

  @ApiPropertyOptional({ enum: PERIODS, default: 'TODAY' })
  @IsOptional()
  @IsIn(PERIODS, {
    message: 'period must be TODAY, THIS_WEEK, THIS_MONTH, ALL_TIME or CUSTOM.',
  })
  period: PeriodValue = 'TODAY';

  @ApiPropertyOptional({ example: '2026-10-01', description: 'First day (YYYY-MM-DD) for period=CUSTOM' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a date as YYYY-MM-DD.' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Last day, inclusive (YYYY-MM-DD) for period=CUSTOM' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be a date as YYYY-MM-DD.' })
  to?: string;
}

export class SessionsReportQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}

export class CustomersReportQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ description: 'Name or phone search' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['SPEND', 'VISITS', 'RECENT'], default: 'SPEND' })
  @IsOptional()
  @IsIn(['SPEND', 'VISITS', 'RECENT'])
  sort: 'SPEND' | 'VISITS' | 'RECENT' = 'SPEND';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 50;
}

export class BranchScopeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}

export class MonthlyReportQueryDto extends BranchScopeQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: 10, description: '1-12' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
