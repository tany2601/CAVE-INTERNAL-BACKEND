import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Full name of the customer starting the session',
    example: 'Rahul Sharma',
  })
  @IsString()
  @IsNotEmpty({ message: 'Customer name is required.' })
  @MaxLength(100, { message: 'Customer name must not exceed 100 characters.' })
  @Transform(({ value }: { value?: string }) => value?.trim())
  customerName: string;

  @ApiPropertyOptional({
    description:
      'Optional mobile phone number of the customer. If provided, loyalty history is tracked.',
    example: '+919876543210',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?[1-9]\d{1,14}|\d{10})$/, {
    message:
      'Invalid mobile number format. Must be a 10-digit number or E.164 international format.',
  })
  @Transform(({ value }: { value?: string }) => (value ? value.trim() : value))
  customerMobile?: string;

  @ApiPropertyOptional({
    description:
      'Optional User ID of the assigned stylist. If omitted at session creation, stylist can be assigned before service completion.',
    example: 'u1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID('4', { message: 'stylistId must be a valid UUID v4.' })
  stylistId?: string;
}
