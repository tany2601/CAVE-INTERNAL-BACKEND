import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, Max, Min, ValidateNested } from 'class-validator';

export class DiscountSettingDto {
  @ApiProperty({ enum: ['PERCENTAGE', 'FIXED'], example: 'PERCENTAGE' })
  @IsIn(['PERCENTAGE', 'FIXED'], { message: 'Choose % or ₹.' })
  type!: 'PERCENTAGE' | 'FIXED';

  @ApiProperty({ example: 10, description: 'A percentage (0–100) or an amount in rupees' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'The discount must be a number with up to 2 decimal places.' })
  @Min(0, { message: 'The discount cannot be negative.' })
  @Max(1_000_000, { message: 'That discount is too large.' })
  value!: number;
}

export class SaveBranchDiscountDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: DiscountSettingDto })
  @ValidateNested()
  @Type(() => DiscountSettingDto)
  services!: DiscountSettingDto;

  @ApiProperty({ type: DiscountSettingDto })
  @ValidateNested()
  @Type(() => DiscountSettingDto)
  products!: DiscountSettingDto;
}
