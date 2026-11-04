import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({
    example: 'Downtown Salon',
    description: 'Unique name of the branch',
  })
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name is required.' })
  name!: string;

  @ApiProperty({
    example: 'DT01',
    description: 'Unique code identifying the branch',
  })
  @IsString({ message: 'Code must be a string.' })
  @IsNotEmpty({ message: 'Code is required.' })
  code!: string;

  @ApiPropertyOptional({
    example: '123 Main Street',
    description: 'Physical address of the branch',
  })
  @IsOptional()
  @IsString({ message: 'Address must be a string.' })
  address?: string;

  @ApiPropertyOptional({
    example: 'Metropolis',
    description: 'City where branch is located',
  })
  @IsOptional()
  @IsString({ message: 'City must be a string.' })
  city?: string;

  @ApiPropertyOptional({
    example: 'NY',
    description: 'State or region where branch is located',
  })
  @IsOptional()
  @IsString({ message: 'State must be a string.' })
  state?: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'Optional 6-digit numeric login PIN. Automatically generated if omitted.',
  })
  @IsOptional()
  @IsString({ message: 'Login PIN must be a string.' })
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits.' })
  loginPin?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210', description: 'Branch contact phone' })
  @IsOptional()
  @IsString({ message: 'Phone must be a string.' })
  @Matches(/^[6-9]\d{9}$/, { message: 'Phone must be a valid 10-digit mobile number.' })
  phone?: string;

  @ApiPropertyOptional({
    example: 'https://g.page/r/CxxxxxxxxxxxxEAI/review',
    description: "The branch's Google review link, printed at the bottom of its WhatsApp bills. null clears it.",
  })
  @IsOptional()
  @IsString({ message: 'The review link must be text.' })
  @MaxLength(300, { message: 'That review link is too long.' })
  @Matches(/^https:\/\/(g\.page|g\.co|goo\.gl|maps\.app\.goo\.gl|share\.google|(?:[a-z0-9-]+\.)*google\.(?:com|co\.in|in))(\/|$)/i, {
    message: 'Paste the Google review link. It starts with https://g.page/… or https://search.google.com/…',
  })
  reviewUrl?: string | null;

  @ApiPropertyOptional({ description: 'Public URL of the branch image' })
  @IsOptional()
  @IsString({ message: 'imageUrl must be a string.' })
  imageUrl?: string;

  @ApiPropertyOptional({ example: 250000, description: 'Monthly revenue target' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'monthlyTarget must be a number.' })
  @Min(0, { message: 'monthlyTarget must be non-negative.' })
  monthlyTarget?: number;

  @ApiPropertyOptional({ description: 'UUID of the staff member managing this branch' })
  @IsOptional()
  @IsUUID('4', { message: 'managerId must be a valid UUID v4.' })
  managerId?: string;

  @ApiPropertyOptional({ example: '4321', description: '4-digit manager login PIN for the branch' })
  @IsOptional()
  @IsString({ message: 'managerPin must be a string.' })
  @Matches(/^\d{4}$/, { message: 'managerPin must be exactly 4 numeric digits.' })
  managerPin?: string;

  @ApiPropertyOptional({ example: '1234', description: '4-digit stylist login PIN for the branch' })
  @IsOptional()
  @IsString({ message: 'stylistPin must be a string.' })
  @Matches(/^\d{4}$/, { message: 'stylistPin must be exactly 4 numeric digits.' })
  stylistPin?: string;
}
