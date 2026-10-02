import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType, PaymentMode } from '@prisma/client';

export class TransactionBranchDto {
  @ApiProperty({ example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Downtown Salon' })
  name!: string;

  @ApiProperty({ example: 'DT01' })
  code!: string;
}

export class TransactionUserDto {
  @ApiProperty({ example: 'u1a2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Rahul Sharma' })
  name!: string;
}

export class BranchTransactionDataDto {
  @ApiProperty({ example: 't1a2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890' })
  branchId!: string;

  @ApiProperty({ type: TransactionBranchDto })
  branch!: TransactionBranchDto;

  @ApiProperty({ enum: TransactionType, example: 'GENERAL_EXPENSE' })
  type!: TransactionType;

  @ApiProperty({ example: 'Product restock' })
  description!: string;

  @ApiProperty({ example: 1200.5 })
  amount!: number;

  @ApiProperty({ enum: PaymentMode, example: 'CASH' })
  paymentMode!: PaymentMode;

  @ApiPropertyOptional({ example: 'u1a2c3d4-e5f6-7890-abcd-ef1234567890', nullable: true })
  employeeId!: string | null;

  @ApiPropertyOptional({ type: TransactionUserDto, nullable: true })
  employee!: TransactionUserDto | null;

  @ApiProperty({ example: 'u9a8b7c6-d5e4-3210-fedc-ba0987654321' })
  createdById!: string;

  @ApiProperty({ type: TransactionUserDto })
  createdBy!: TransactionUserDto;

  @ApiProperty({ example: '2026-10-02T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-02T12:00:00.000Z' })
  updatedAt!: Date;
}
