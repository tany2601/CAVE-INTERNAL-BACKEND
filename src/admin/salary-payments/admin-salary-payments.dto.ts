import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { SalaryVia } from '@prisma/client';

export class CreateSalaryPaymentDto {
  @ApiProperty({ description: 'Employee being paid' })
  @IsUUID('4', { message: 'userId must be a valid UUID v4.' })
  userId!: string;

  @ApiProperty({ example: 19500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'amount must be a number.' })
  @Min(0.01, { message: 'amount must be greater than zero.' })
  amount!: number;

  @ApiPropertyOptional({ enum: SalaryVia, default: SalaryVia.GPAY })
  @IsOptional()
  @IsEnum(SalaryVia, { message: 'via must be CASH, GPAY or BANK_TRANSFER.' })
  via?: SalaryVia;

  @ApiPropertyOptional({ example: 'March salary' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;
}
