import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';

export class ListServicesQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number for pagination (minimum 1)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer.' })
  @Min(1, { message: 'Page must be greater than or equal to 1.' })
  page: number = 1;

  @ApiPropertyOptional({
    example: 10,
    default: 10,
    description: 'Number of records per page (1 to 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer.' })
  @Min(1, { message: 'Limit must be greater than or equal to 1.' })
  @Max(100, { message: 'Limit cannot exceed 100.' })
  limit: number = 10;

  @ApiPropertyOptional({
    example: 'Haircut',
    description: 'Search string to filter services by name or category',
  })
  @IsOptional()
  @IsString({ message: 'Search query must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({
    example: 'Hair Care',
    description: 'Filter services by category',
  })
  @IsOptional()
  @IsString({ message: 'Category must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  category?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter services by active status (true or false)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'isActive must be a boolean value.' })
  isActive?: boolean;
}
