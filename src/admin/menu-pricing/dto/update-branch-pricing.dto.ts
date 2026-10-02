import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateBranchPricingDto {
  @ApiPropertyOptional({
    example: 160.0,
    description: 'Updated price for the service at this branch',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number.' })
  @Min(0, { message: 'Price must be non-negative.' })
  price?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Active status of the branch pricing record',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean.' })
  isActive?: boolean;
}
