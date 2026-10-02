import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CommissionModel } from '@prisma/client';

export class CreateStaffSlabDto {
  @ApiProperty({ example: 1, description: 'Slab order (1, 2, or 3)' })
  @IsInt({ message: 'slabOrder must be an integer.' })
  @Min(1, { message: 'slabOrder must be 1, 2, or 3.' })
  @Max(3, { message: 'slabOrder must be 1, 2, or 3.' })
  slabOrder!: number;

  @ApiProperty({ example: 10000, description: 'Minimum revenue threshold for this slab' })
  @Type(() => Number)
  @IsNumber({}, { message: 'minRevenue must be a number.' })
  @Min(0, { message: 'minRevenue must be non-negative.' })
  minRevenue!: number;

  @ApiProperty({ example: 5, description: 'Commission percentage for this slab (0 to 100)' })
  @Type(() => Number)
  @IsNumber({}, { message: 'commissionPercentage must be a number.' })
  @Min(0, { message: 'commissionPercentage must be non-negative.' })
  @Max(100, { message: 'commissionPercentage cannot exceed 100.' })
  commissionPercentage!: number;
}

export class CreateStaffDto {
  @ApiProperty({
    example: 'Rahul Sharma',
    description: 'Full name of the staff member',
  })
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name is required.' })
  name!: string;

  @ApiProperty({
    example: '12c9bc67-4306-4039-9eea-fe856360e1cf',
    description: 'UUID of the role (MANAGER or STYLIST)',
  })
  @IsString({ message: 'roleId must be a string.' })
  @IsNotEmpty({ message: 'roleId is required.' })
  @IsUUID('all', { message: 'roleId must be a valid UUID.' })
  roleId!: string;

  @ApiProperty({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the assigned branch',
  })
  @IsString({ message: 'branchId must be a string.' })
  @IsNotEmpty({ message: 'branchId is required.' })
  @IsUUID('all', { message: 'branchId must be a valid UUID.' })
  branchId!: string;

  @ApiPropertyOptional({
    example: 25000,
    description: 'Monthly base salary of the staff member',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'monthlySalary must be a number.' })
  @Min(0, { message: 'monthlySalary must be non-negative.' })
  monthlySalary?: number;

  @ApiPropertyOptional({
    enum: CommissionModel,
    example: 'FLAT_PERCENTAGE',
    description: 'Commission model type (FLAT_PERCENTAGE, DAILY_TARGET, MONTHLY_TARGET)',
  })
  @IsOptional()
  @IsEnum(CommissionModel, {
    message: 'commissionModel must be FLAT_PERCENTAGE, DAILY_TARGET, or MONTHLY_TARGET.',
  })
  commissionModel?: CommissionModel;

  @ApiPropertyOptional({
    example: 10,
    description: 'Flat commission percentage (for FLAT_PERCENTAGE model)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'flatCommissionPercentage must be a number.' })
  @Min(0, { message: 'flatCommissionPercentage must be non-negative.' })
  @Max(100, { message: 'flatCommissionPercentage cannot exceed 100.' })
  flatCommissionPercentage?: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Daily revenue target amount (for DAILY_TARGET model)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'dailyTargetAmount must be a number.' })
  @Min(0, { message: 'dailyTargetAmount must be non-negative.' })
  dailyTargetAmount?: number;

  @ApiPropertyOptional({
    type: [CreateStaffSlabDto],
    description: 'Three configurable commission slabs (for MONTHLY_TARGET model)',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateStaffSlabDto)
  commissionSlabs?: CreateStaffSlabDto[];
}
