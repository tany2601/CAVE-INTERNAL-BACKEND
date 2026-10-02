import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdateServiceDto {
  @ApiPropertyOptional({
    example: 'Haircut Premium',
    description: 'Updated name of the global service',
  })
  @IsOptional()
  @IsString({ message: 'Name must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated service description',
    description: 'Updated detailed description of the service',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiPropertyOptional({
    example: 'Hair Care',
    description: 'Updated category of the service',
  })
  @IsOptional()
  @IsString({ message: 'Category must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  category?: string;

  @ApiPropertyOptional({
    example: 45,
    description: 'Updated estimated duration of service in minutes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Duration must be an integer.' })
  @Min(1, { message: 'Duration must be at least 1 minute.' })
  durationMin?: number;
}
