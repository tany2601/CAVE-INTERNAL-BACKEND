import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CustomerLookupQueryDto {
  @ApiPropertyOptional({ example: '9876543210', description: 'The number to look up (or send customerId instead)' })
  @ValidateIf((o: CustomerLookupQueryDto) => !o.customerId)
  @IsString()
  @IsNotEmpty({ message: 'phone is required.' })
  @Matches(/^[+\d][\d\s-]{6,19}$/, { message: 'Invalid phone number.' })
  phone?: string;

  @ApiPropertyOptional({ description: 'A customer picked from the suggestions' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId must be a valid UUID v4.' })
  customerId?: string;
}

export class CustomerSuggestQueryDto {
  @ApiProperty({ example: 'Ravi Kumar', description: 'The name typed so far; customers with this exact name are suggested' })
  @IsString()
  @Transform(({ value }: { value?: string }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @MinLength(2, { message: 'Type at least two letters of the name.' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '98', description: 'The digits of the number typed so far; only numbers starting with them are suggested' })
  @IsOptional()
  @Transform(({ value }: { value?: string }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{0,10}$/, { message: 'digits must be at most 10 digits.' })
  digits?: string;
}
