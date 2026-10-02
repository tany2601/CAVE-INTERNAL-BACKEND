import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  IsEnum,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { TransactionType, PaymentMode } from '@prisma/client';

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number for pagination (minimum 1)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer.' })
  @Min(1, { message: 'Page must be greater than or equal to 1.' })
  page: number = 1;

  @ApiPropertyOptional({
    example: 10,
    default: 10,
    description: 'Number of records per page (1 to 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer.' })
  @Min(1, { message: 'Limit must be greater than or equal to 1.' })
  @Max(100, { message: 'Limit cannot exceed 100.' })
  limit: number = 10;

  @ApiPropertyOptional({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Filter transactions by branch UUID',
  })
  @IsOptional()
  @IsUUID('4', { message: 'branchId must be a valid UUID v4.' })
  branchId?: string;

  @ApiPropertyOptional({
    enum: TransactionType,
    example: 'GENERAL_EXPENSE',
    description: 'Filter transactions by type (GENERAL_EXPENSE or EMPLOYEE_ADVANCE)',
  })
  @IsOptional()
  @IsEnum(TransactionType, {
    message: 'type must be GENERAL_EXPENSE or EMPLOYEE_ADVANCE.',
  })
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: PaymentMode,
    example: 'CASH',
    description: 'Filter transactions by payment mode (CASH or GPAY)',
  })
  @IsOptional()
  @IsEnum(PaymentMode, { message: 'paymentMode must be CASH or GPAY.' })
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({
    example: 'u1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Filter transactions by employee UUID',
  })
  @IsOptional()
  @IsUUID('4', { message: 'employeeId must be a valid UUID v4.' })
  employeeId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Filter transactions starting from date (ISO 8601 string)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string.' })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-02T23:59:59.999Z',
    description: 'Filter transactions up to date (ISO 8601 string)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string.' })
  endDate?: string;

  @ApiPropertyOptional({
    example: 'restock',
    description: 'Search string to filter transactions by description',
  })
  @IsOptional()
  @IsString({ message: 'Search query must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
