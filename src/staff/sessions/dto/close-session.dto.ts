import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsEnum,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DiscountType, PaymentMode } from '@prisma/client';

export class CloseSessionServiceItemDto {
  @ApiProperty({
    description: 'UUID of the active branch menu service pricing',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID('4', { message: 'servicePricingId must be a valid UUID v4.' })
  @IsNotEmpty({ message: 'servicePricingId is required.' })
  servicePricingId: string;
}

export class CloseSessionCustomServiceItemDto {
  @ApiProperty({
    description: 'Name of the custom service',
    example: 'Special Hair Design & Beard Styling',
  })
  @IsString()
  @IsNotEmpty({ message: 'Custom service name is required.' })
  @MaxLength(100, {
    message: 'Custom service name must not exceed 100 characters.',
  })
  @Transform(({ value }: { value?: string }) => value?.trim())
  name: string;

  @ApiProperty({
    description: 'Price for the custom service (non-negative)',
    example: 350.0,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Custom service price must be a number with up to 2 decimal places.' },
  )
  @Min(0, { message: 'Custom service price must be non-negative.' })
  price: number;
}

export class CloseSessionProductItemDto {
  @ApiProperty({
    description: 'Name of the product sold during billing',
    example: 'Matte Finish Hair Styling Clay',
  })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required.' })
  @MaxLength(100, { message: 'Product name must not exceed 100 characters.' })
  @Transform(({ value }: { value?: string }) => value?.trim())
  productName: string;

  @ApiProperty({
    description: 'Price/amount of the product sold (non-negative)',
    example: 499.0,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Product price must be a number with up to 2 decimal places.' },
  )
  @Min(0, { message: 'Product price must be non-negative.' })
  price: number;

  @ApiPropertyOptional({
    enum: PaymentMode,
    default: PaymentMode.CASH,
    description: 'Payment mode for product sale',
    example: PaymentMode.CASH,
  })
  @IsOptional()
  @IsEnum(PaymentMode, { message: 'Invalid product payment mode.' })
  paymentMode?: PaymentMode;
}

export class CloseSessionDto {
  @ApiPropertyOptional({
    type: [CloseSessionServiceItemDto],
    description: 'List of menu services selected from branch pricing',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CloseSessionServiceItemDto)
  services?: CloseSessionServiceItemDto[];

  @ApiPropertyOptional({
    type: [CloseSessionCustomServiceItemDto],
    description: 'List of optional custom services',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CloseSessionCustomServiceItemDto)
  customServices?: CloseSessionCustomServiceItemDto[];

  @ApiPropertyOptional({
    type: [CloseSessionProductItemDto],
    description: 'List of optional product sales',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CloseSessionProductItemDto)
  productSales?: CloseSessionProductItemDto[];

  @ApiPropertyOptional({
    enum: DiscountType,
    default: DiscountType.NONE,
    description: 'Discount type applied during billing',
    example: DiscountType.NONE,
  })
  @IsOptional()
  @IsEnum(DiscountType, { message: 'Invalid discount type.' })
  discountType?: DiscountType;

  @ApiPropertyOptional({
    description:
      'Discount value (percentage between 0-100 or fixed amount <= pre-discount subtotal)',
    example: 10.0,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Discount value must be a number with up to 2 decimal places.' },
  )
  @Min(0, { message: 'Discount value must be non-negative.' })
  discountValue?: number;

  @ApiPropertyOptional({
    description: 'Tip amount for the stylist (stored separately)',
    example: 50.0,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Tip amount must be a number with up to 2 decimal places.' },
  )
  @Min(0, { message: 'Tip amount must be non-negative.' })
  tipAmount?: number;

  @ApiProperty({
    enum: PaymentMode,
    description: 'Primary payment mode for closing the session',
    example: PaymentMode.CASH,
  })
  @IsEnum(PaymentMode, { message: 'Payment mode is required and must be valid.' })
  @IsNotEmpty({ message: 'Payment mode is required.' })
  paymentMode: PaymentMode;
}
