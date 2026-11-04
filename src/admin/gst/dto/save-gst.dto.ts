import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class GstSideDto {
  @ApiProperty({ example: 5, description: 'Total GST rate in percent (CGST and SGST are half each)' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'The rate must be a number with up to 2 decimal places.' })
  @Min(0, { message: 'The rate cannot be negative.' })
  @Max(100, { message: 'The rate cannot be more than 100%.' })
  rate!: number;

  @ApiProperty({ example: false, description: 'True when the listed prices already include the GST' })
  @IsBoolean()
  inclusive!: boolean;
}

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SaveGstDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ example: '29AAOCC1889N1ZO' })
  @Transform(upper)
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'That is not a valid GSTIN.' })
  gstin!: string;

  @ApiProperty({ example: 'CAVE Salons Pvt Ltd', required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  legalName?: string;

  @ApiProperty({ type: GstSideDto })
  @ValidateNested()
  @Type(() => GstSideDto)
  services!: GstSideDto;

  @ApiProperty({ type: GstSideDto })
  @ValidateNested()
  @Type(() => GstSideDto)
  products!: GstSideDto;

  @ApiProperty({ type: [String], description: 'Services (ids) whose menu price already includes the GST; every other service has it added on top' })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  inclusiveServiceIds!: string[];

  @ApiProperty({ example: '999721', required: false, description: 'SAC code for services, printed on the bill when filled in' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^([0-9]{4,8})?$/, { message: 'The SAC code is 4 to 8 digits.' })
  servicesCode?: string;

  @ApiProperty({ example: '3304', required: false, description: 'HSN code for products, printed on the bill when filled in' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^([0-9]{4,8})?$/, { message: 'The HSN code is 4 to 8 digits.' })
  productsCode?: string;
}
