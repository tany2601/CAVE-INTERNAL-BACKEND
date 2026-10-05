import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMode, PayoutKind } from '@prisma/client';

export class StatsQueryDto {
  @ApiPropertyOptional({ enum: ['TODAY', 'THIS_WEEK', 'THIS_MONTH'], default: 'TODAY' })
  @IsOptional()
  @IsIn(['TODAY', 'THIS_WEEK', 'THIS_MONTH'], {
    message: 'period must be TODAY, THIS_WEEK or THIS_MONTH.',
  })
  period: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' = 'TODAY';
}

export class SetOpeningBalanceDto {
  @ApiProperty({ example: 10000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cash!: number;

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  gpay!: number;
}

export class CloseDayDto {
  @ApiProperty({ example: 9450, description: 'Cash physically counted' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualCash!: number;

  @ApiProperty({ example: 5724.1, description: 'GPay balance received' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualGpay!: number;
}

export class CreatePayoutDto {
  @ApiProperty({ description: 'Staff member being paid' })
  @IsUUID('4', { message: 'userId must be a valid UUID v4.' })
  userId!: string;

  @ApiPropertyOptional({ enum: PayoutKind, default: PayoutKind.COMMISSION })
  @IsOptional()
  @IsEnum(PayoutKind)
  kind?: PayoutKind;

  @ApiPropertyOptional({
    description: "Amount paid. Defaults to the stylist's commission earned today.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode, { message: 'paymentMode must be CASH or GPAY.' })
  paymentMode!: PaymentMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;
}

export class SetChecklistItemDto {
  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}

