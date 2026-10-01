import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BranchDataDto {
  @ApiProperty({ example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Downtown Salon' })
  name!: string;

  @ApiProperty({ example: 'DT01' })
  code!: string;

  @ApiPropertyOptional({ example: '123 Main Street', nullable: true })
  address!: string | null;

  @ApiPropertyOptional({ example: 'Metropolis', nullable: true })
  city!: string | null;

  @ApiPropertyOptional({ example: 'NY', nullable: true })
  state!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  updatedAt!: Date;
}

export class CreateBranchResponseDto {
  @ApiProperty({ example: 'Branch created successfully' })
  message!: string;

  @ApiProperty({ type: BranchDataDto })
  branch!: BranchDataDto;

  @ApiPropertyOptional({
    example: '654321',
    description: 'Auto-generated 6-digit login PIN. Only included when loginPin was omitted in request.',
  })
  loginPin?: string;
}
