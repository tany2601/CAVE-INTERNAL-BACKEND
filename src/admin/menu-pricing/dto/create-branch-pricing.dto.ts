import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBranchPricingDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the global service',
  })
  @IsUUID('4', { message: 'serviceId must be a valid UUID v4.' })
  @IsNotEmpty({ message: 'serviceId is required.' })
  serviceId!: string;

  @ApiProperty({
    example: 150.0,
    description: 'Price for the service at this branch',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number.' })
  @Min(0, { message: 'Price must be non-negative.' })
  price!: number;
}
