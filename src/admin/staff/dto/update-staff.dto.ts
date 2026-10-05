import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CommissionModel } from '@prisma/client';
import { CreateStaffSlabDto } from './create-staff.dto.js';

export class UpdateStaffDto {
  @ApiPropertyOptional({
    example: 'Rahul Sharma',
    description: 'Updated name of the staff member',
  })
  @IsOptional()
  @IsString({ message: 'Name must be a string.' })
  @Matches(/^\p{L}[\p{L}\p{M}\s.'’-]*$/u, {
    message: 'Name can only contain letters, spaces and . \' -',
  })
  name?: string;

  @ApiPropertyOptional({
    example: '12c9bc67-4306-4039-9eea-fe856360e1cf',
    description: 'UUID of the role (MANAGER or STYLIST)',
  })
  @IsOptional()
  @IsString({ message: 'roleId must be a string.' })
  @IsUUID('all', { message: 'roleId must be a valid UUID.' })
  roleId?: string;

  @ApiPropertyOptional({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the assigned branch',
  })
  @IsOptional()
  @IsString({ message: 'branchId must be a string.' })
  @IsUUID('all', { message: 'branchId must be a valid UUID.' })
  branchId?: string;

  @ApiPropertyOptional({
    example: 25000,
    description: 'Updated monthly base salary',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'monthlySalary must be a number.' })
  @Min(0, { message: 'monthlySalary must be non-negative.' })
  monthlySalary?: number;

  @ApiPropertyOptional({
    enum: CommissionModel,
    example: 'FLAT_PERCENTAGE',
    description: 'Updated commission model type',
  })
  @IsOptional()
  @IsEnum(CommissionModel, {
    message: 'commissionModel must be FLAT_PERCENTAGE, DAILY_TARGET, or MONTHLY_TARGET.',
  })
  commissionModel?: CommissionModel;

  @ApiPropertyOptional({
    example: 12,
    description: 'Updated flat commission percentage',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'flatCommissionPercentage must be a number.' })
  @Min(0, { message: 'flatCommissionPercentage must be non-negative.' })
  @Max(100, { message: 'flatCommissionPercentage cannot exceed 100.' })
  flatCommissionPercentage?: number;

  @ApiPropertyOptional({
    example: 6000,
    description: 'Updated daily target revenue amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'dailyTargetAmount must be a number.' })
  @Min(0, { message: 'dailyTargetAmount must be non-negative.' })
  dailyTargetAmount?: number;

  @ApiPropertyOptional({
    type: [CreateStaffSlabDto],
    description: 'Updated commission slabs for MONTHLY_TARGET model',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateStaffSlabDto)
  commissionSlabs?: CreateStaffSlabDto[];

  @ApiPropertyOptional({ example: '9876543210', description: 'Contact phone number' })
  @IsOptional()
  @IsString({ message: 'phone must be a string.' })
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit mobile number.' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Public URL of the staff photo' })
  @IsOptional()
  @IsString({ message: 'photoUrl must be a string.' })
  photoUrl?: string;

  @ApiPropertyOptional({ example: 9000, description: 'Daily revenue target' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'dailyRevenueTarget must be a number.' })
  @Min(0, { message: 'dailyRevenueTarget must be non-negative.' })
  dailyRevenueTarget?: number;

  @ApiPropertyOptional({ example: 250000, description: 'Monthly revenue target' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'monthlyRevenueTarget must be a number.' })
  @Min(0, { message: 'monthlyRevenueTarget must be non-negative.' })
  monthlyRevenueTarget?: number;
}
