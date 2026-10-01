import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({
    example: 'Downtown Salon',
    description: 'Unique name of the branch',
  })
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name is required.' })
  name!: string;

  @ApiProperty({
    example: 'DT01',
    description: 'Unique code identifying the branch',
  })
  @IsString({ message: 'Code must be a string.' })
  @IsNotEmpty({ message: 'Code is required.' })
  code!: string;

  @ApiPropertyOptional({
    example: '123 Main Street',
    description: 'Physical address of the branch',
  })
  @IsOptional()
  @IsString({ message: 'Address must be a string.' })
  address?: string;

  @ApiPropertyOptional({
    example: 'Metropolis',
    description: 'City where branch is located',
  })
  @IsOptional()
  @IsString({ message: 'City must be a string.' })
  city?: string;

  @ApiPropertyOptional({
    example: 'NY',
    description: 'State or region where branch is located',
  })
  @IsOptional()
  @IsString({ message: 'State must be a string.' })
  state?: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'Optional 6-digit numeric login PIN. Automatically generated if omitted.',
  })
  @IsOptional()
  @IsString({ message: 'Login PIN must be a string.' })
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits.' })
  loginPin?: string;
}
