import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMode } from '@prisma/client';

export class UpdateTransactionDto {
  @ApiPropertyOptional({
    example: 'Updated product restock description',
    description: 'Updated description of the transaction',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiPropertyOptional({
    example: 1500.0,
    description: 'Updated transaction amount (must be positive number with at most 2 decimals)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Amount must be a number.' })
  @Min(0.01, { message: 'Amount must be greater than zero.' })
  amount?: number;

  @ApiPropertyOptional({
    enum: PaymentMode,
    example: 'GPAY',
    description: 'Updated payment mode (CASH or GPAY)',
  })
  @IsOptional()
  @IsEnum(PaymentMode, { message: 'paymentMode must be CASH or GPAY.' })
  paymentMode?: PaymentMode;
}
