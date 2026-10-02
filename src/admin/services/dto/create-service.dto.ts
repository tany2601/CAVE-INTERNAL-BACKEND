import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateServiceDto {
  @ApiProperty({
    example: 'Haircut',
    description: 'Unique name of the global service',
  })
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name is required.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiPropertyOptional({
    example: 'Standard haircut and styling',
    description: 'Detailed description of the service',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiPropertyOptional({
    example: 'Hair Care',
    description: 'Category of the service',
  })
  @IsOptional()
  @IsString({ message: 'Category must be a string.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  category?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Estimated duration of service in minutes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Duration must be an integer.' })
  @Min(1, { message: 'Duration must be at least 1 minute.' })
  durationMin?: number;
}
