import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleDto } from '../../roles/dto/role-response.dto.js';
import { BranchDataDto } from '../../branches/dto/create-branch-response.dto.js';
import { CommissionModel } from '@prisma/client';

export class StaffCommissionSlabDto {
  @ApiProperty({ example: 'slab-uuid-123' })
  id!: string;

  @ApiProperty({ example: 1 })
  slabOrder!: number;

  @ApiProperty({ example: 10000 })
  minRevenue!: number;

  @ApiProperty({ example: 5 })
  commissionPercentage!: number;
}

export class StaffDataDto {
  @ApiProperty({ example: 'user-staff-uuid-123' })
  id!: string;

  @ApiProperty({ example: 'Rahul Sharma' })
  name!: string;

  @ApiPropertyOptional({ example: 'rahul@cave.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'role-uuid-123' })
  roleId!: string;

  @ApiProperty({ type: RoleDto })
  role!: RoleDto;

  @ApiPropertyOptional({ example: 'branch-uuid-123', nullable: true })
  branchId!: string | null;

  @ApiPropertyOptional({ type: BranchDataDto, nullable: true })
  branch!: BranchDataDto | null;

  @ApiPropertyOptional({ example: 25000, nullable: true })
  monthlySalary!: number | null;

  @ApiPropertyOptional({ enum: CommissionModel, nullable: true, example: 'FLAT_PERCENTAGE' })
  commissionModel!: CommissionModel | null;

  @ApiPropertyOptional({ example: 10, nullable: true })
  flatCommissionPercentage!: number | null;

  @ApiPropertyOptional({ example: 5000, nullable: true })
  dailyTargetAmount!: number | null;

  @ApiPropertyOptional({ type: [StaffCommissionSlabDto] })
  commissionSlabs?: StaffCommissionSlabDto[];

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  updatedAt!: Date;
}

export class CreateStaffResponseDto {
  @ApiProperty({ example: 'Staff member created successfully' })
  message!: string;

  @ApiProperty({ type: StaffDataDto })
  staff!: StaffDataDto;
}
