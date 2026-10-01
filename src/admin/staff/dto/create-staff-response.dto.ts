import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleDto } from '../../roles/dto/role-response.dto.js';
import { BranchDataDto } from '../../branches/dto/create-branch-response.dto.js';

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
