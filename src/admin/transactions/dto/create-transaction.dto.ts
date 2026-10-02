import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TransactionType, PaymentMode } from '@prisma/client';

export class CreateTransactionDto {
  @ApiProperty({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the target branch',
  })
  @IsUUID('4', { message: 'branchId must be a valid UUID v4.' })
  @IsNotEmpty({ message: 'branchId is required.' })
  branchId!: string;

  @ApiProperty({
    enum: TransactionType,
    example: 'GENERAL_EXPENSE',
    description: 'Type of transaction (GENERAL_EXPENSE or EMPLOYEE_ADVANCE)',
  })
  @IsEnum(TransactionType, {
    message: 'type must be GENERAL_EXPENSE or EMPLOYEE_ADVANCE.',
  })
  @IsNotEmpty({ message: 'type is required.' })
  type!: TransactionType;

  @ApiProperty({
    example: 'Product restock',
    description: 'Description of the transaction',
  })
  @IsString({ message: 'Description must be a string.' })
  @IsNotEmpty({ message: 'Description is required.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiProperty({
    example: 1200.5,
    description: 'Transaction amount (must be positive number with at most 2 decimals)',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Amount must be a number.' })
  @Min(0.01, { message: 'Amount must be greater than zero.' })
  amount!: number;

  @ApiProperty({
    enum: PaymentMode,
    example: 'CASH',
    description: 'Payment mode (CASH or GPAY)',
  })
  @IsEnum(PaymentMode, { message: 'paymentMode must be CASH or GPAY.' })
  @IsNotEmpty({ message: 'paymentMode is required.' })
  paymentMode!: PaymentMode;

  @ApiPropertyOptional({
    example: 'u1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the staff member (required for EMPLOYEE_ADVANCE, forbidden for GENERAL_EXPENSE)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'employeeId must be a valid UUID v4.' })
  employeeId?: string;
}
