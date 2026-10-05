import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMode, TransactionType } from '@prisma/client';

export class CreateStaffExpenseDto {
  @ApiProperty({ enum: TransactionType, example: 'GENERAL_EXPENSE' })
  @IsEnum(TransactionType, {
    message: 'type must be GENERAL_EXPENSE or EMPLOYEE_ADVANCE.',
  })
  type!: TransactionType;

  @ApiProperty({ example: 'Towels & supplies' })
  @IsString()
  @IsNotEmpty({ message: 'Description is required.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiProperty({ example: 850 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Amount must be a number.' })
  @Min(0.01, { message: 'Amount must be greater than zero.' })
  amount!: number;

  @ApiProperty({ enum: PaymentMode, example: 'CASH' })
  @IsEnum(PaymentMode, { message: 'paymentMode must be CASH or GPAY.' })
  paymentMode!: PaymentMode;

  @ApiPropertyOptional({
    description: 'Staff member receiving the advance (required for EMPLOYEE_ADVANCE)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'employeeId must be a valid UUID v4.' })
  employeeId?: string;
}
