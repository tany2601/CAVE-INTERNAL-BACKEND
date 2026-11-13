import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  MinLength,
  Matches,
  IsUUID,
  IsArray,
  IsBoolean,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { capitalizeName } from '../../../common/customer-match.js';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Full name of the customer starting the session',
    example: 'Rahul Sharma',
  })
  @IsString()
  @IsNotEmpty({ message: 'Customer name is required.' })
  @MinLength(3, { message: 'Please enter your real name.' })
  @Matches(/^\p{L}[\p{L}\p{M}\s.'’-]*$/u, {
    message: 'Name can only contain letters, spaces and . \' -',
  })
  @MaxLength(100, { message: 'Customer name must not exceed 100 characters.' })
  @Transform(({ value }: { value?: string }) => (typeof value === 'string' ? capitalizeName(value.trim()) : value))
  customerName: string;

  @ApiPropertyOptional({
    description:
      'A returning customer picked from the suggestions. Their saved name and number are used (customerMobile is ignored), so what was shown is exactly what is saved.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'customerId must be a valid UUID v4.' })
  customerId?: string;

  @ApiPropertyOptional({
    description:
      'Optional mobile phone number of the customer. If provided, loyalty history is tracked.',
    example: '+919876543210',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(\+91)?[6-9]\d{9}$/, {
    message:
      'Invalid mobile number. Must be a 10-digit Indian mobile number starting with 6-9 (optionally prefixed with +91).',
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

  @ApiPropertyOptional({
    type: [String],
    description:
      'Optional branch menu items (servicePricingIds) the customer picked while checking in. They are pre-selected when the session is billed.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30, { message: 'Too many services selected.' })
  @ArrayUnique({ message: 'Services must not repeat.' })
  @IsUUID('4', { each: true, message: 'Each service must be a valid UUID v4.' })
  serviceIds?: string[];

  @ApiPropertyOptional({
    description: 'Start the service timer right away instead of calling start-service afterwards.',
  })
  @IsOptional()
  @IsBoolean()
  startNow?: boolean;
}
