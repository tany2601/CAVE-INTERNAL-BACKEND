import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class BulkPricingItemDto {
  @ApiProperty({
    example: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the target branch',
  })
  @IsUUID('4', { message: 'branchId must be a valid UUID v4.' })
  @IsNotEmpty({ message: 'branchId is required.' })
  branchId!: string;

  @ApiProperty({
    example: 's1a2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the global service',
  })
  @IsUUID('4', { message: 'serviceId must be a valid UUID v4.' })
  @IsNotEmpty({ message: 'serviceId is required.' })
  serviceId!: string;

  @ApiProperty({
    example: 150.0,
    description: 'Price for the service at the specified branch',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number.' })
  @Min(0, { message: 'Price must be non-negative.' })
  price!: number;
}

export class BulkMenuPricingDto {
  @ApiProperty({
    type: [BulkPricingItemDto],
    description: 'List of branch-service price assignments',
  })
  @IsArray({ message: 'items must be an array.' })
  @ArrayMinSize(1, { message: 'items array must contain at least one item.' })
  @ValidateNested({ each: true })
  @Type(() => BulkPricingItemDto)
  items!: BulkPricingItemDto[];
}
