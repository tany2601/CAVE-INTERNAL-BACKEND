import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  IsUUID,
  ValidateIf,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({ example: '+91 98765 43210', description: 'Branch contact phone' })
  @IsOptional()
  @IsString({ message: 'Phone must be a string.' })
  @Matches(/^[6-9]\d{9}$/, { message: 'Phone must be a valid 10-digit mobile number.' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Public URL of the branch image' })
  @IsOptional()
  @IsString({ message: 'imageUrl must be a string.' })
  imageUrl?: string;

  @ApiPropertyOptional({ example: 250000, description: 'Monthly revenue target' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'monthlyTarget must be a number.' })
  @Min(0, { message: 'monthlyTarget must be non-negative.' })
  monthlyTarget?: number;

  @ApiPropertyOptional({ description: 'UUID of the staff member managing this branch' })
  @ValidateIf((o) => o.managerId !== null)
  @IsOptional()
  @IsUUID('4', { message: 'managerId must be a valid UUID v4.' })
  managerId?: string | null;

  @ApiPropertyOptional({ example: '4321', description: '4-digit manager login PIN for the branch' })
  @IsOptional()
  @IsString({ message: 'managerPin must be a string.' })
  @Matches(/^\d{4}$/, { message: 'managerPin must be exactly 4 numeric digits.' })
  managerPin?: string;

  @ApiPropertyOptional({ example: '1234', description: '4-digit stylist login PIN for the branch' })
  @IsOptional()
  @IsString({ message: 'stylistPin must be a string.' })
  @Matches(/^\d{4}$/, { message: 'stylistPin must be exactly 4 numeric digits.' })
  stylistPin?: string;
}
