import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateStaffDto {
  @ApiPropertyOptional({
    example: 'Rahul Sharma',
    description: 'Updated full name of staff member',
  })
  @IsOptional()
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  name?: string;

  @ApiPropertyOptional({
    example: '12c9bc67-4306-4039-9eea-fe856360e1cf',
    description: 'Updated role UUID (MANAGER or STYLIST)',
  })
  @IsOptional()
  @IsString({ message: 'roleId must be a string.' })
  @IsUUID('all', { message: 'roleId must be a valid UUID.' })
  roleId?: string;

  @ApiPropertyOptional({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Updated assigned branch UUID',
  })
  @IsOptional()
  @IsString({ message: 'branchId must be a string.' })
  @IsUUID('all', { message: 'branchId must be a valid UUID.' })
  branchId?: string;
}
