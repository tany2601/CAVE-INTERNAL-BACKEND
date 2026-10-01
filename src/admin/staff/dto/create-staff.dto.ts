import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

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
}
