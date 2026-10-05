import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductDto {
  @ApiProperty({ example: 'Matte Clay' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required.' })
  @MaxLength(100, { message: 'Product name must not exceed 100 characters.' })
  @Transform(trim)
  name!: string;

  @ApiProperty({ example: 599 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Price must be a number with up to 2 decimal places.' })
  @Min(0, { message: 'Price must be non-negative.' })
  price!: number;

  @ApiPropertyOptional({ example: 'Strong hold, matte finish' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional({ example: 'Styling' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  category?: string;

  @ApiPropertyOptional({ description: 'Public URL of the product image' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Product name cannot be empty.' })
  @MaxLength(100)
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
