import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateBranchDto {
  @ApiPropertyOptional({
    example: 'Downtown Salon Main',
    description: 'Updated branch name',
  })
  @IsOptional()
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  name?: string;

  @ApiPropertyOptional({
    example: 'DT01-A',
    description: 'Updated branch code',
  })
  @IsOptional()
  @IsString({ message: 'Code must be a string.' })
  @IsNotEmpty({ message: 'Code cannot be empty.' })
  code?: string;

  @ApiPropertyOptional({
    example: '456 Main Street',
    description: 'Updated physical address',
  })
  @IsOptional()
  @IsString({ message: 'Address must be a string.' })
  address?: string;

  @ApiPropertyOptional({
    example: 'Metropolis',
    description: 'Updated city',
  })
  @IsOptional()
  @IsString({ message: 'City must be a string.' })
  city?: string;

  @ApiPropertyOptional({
    example: 'NY',
    description: 'Updated state',
  })
  @IsOptional()
  @IsString({ message: 'State must be a string.' })
  state?: string;
}
