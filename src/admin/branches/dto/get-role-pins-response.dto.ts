import { ApiProperty } from '@nestjs/swagger';

export class RolePinStatusDto {
  @ApiProperty({ example: 'MANAGER' })
  role!: string;

  @ApiProperty({ example: true })
  isConfigured!: boolean;
}

export class GetRolePinsResponseDto {
  @ApiProperty({ example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890' })
  branchId!: string;

  @ApiProperty({ type: [RolePinStatusDto] })
  roles!: RolePinStatusDto[];
}
