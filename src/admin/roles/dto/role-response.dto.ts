import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RoleDto {
  @ApiProperty({ example: 'role-uuid-123' })
  id!: string;

  @ApiProperty({ example: 'MANAGER' })
  name!: string;

  @ApiPropertyOptional({ example: 'Branch manager', nullable: true })
  description!: string | null;
}

export class GetRolesResponseDto {
  @ApiProperty({ type: [RoleDto] })
  data!: RoleDto[];
}
