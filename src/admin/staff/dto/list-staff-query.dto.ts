import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  IsBoolean,
  IsUUID,
} from 'class-validator';

export class ListStaffQueryDto {
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
    example: 'Rahul',
    description: 'Search string to filter staff members by name',
  })
  @IsOptional()
  @IsString({ message: 'Search query must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Filter staff by assigned branch UUID',
  })
  @IsOptional()
  @IsString({ message: 'branchId must be a string.' })
  @IsUUID('all', { message: 'branchId must be a valid UUID.' })
  branchId?: string;

  @ApiPropertyOptional({
    example: '12c9bc67-4306-4039-9eea-fe856360e1cf',
    description: 'Filter staff by role UUID',
  })
  @IsOptional()
  @IsString({ message: 'roleId must be a string.' })
  @IsUUID('all', { message: 'roleId must be a valid UUID.' })
  roleId?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter staff by active status (true or false)',
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
