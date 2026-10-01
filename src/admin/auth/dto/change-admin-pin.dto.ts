import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ChangeAdminPinDto {
  @ApiProperty({
    description: 'Current 6-digit numeric PIN',
    example: '482613',
  })
  @IsNotEmpty({ message: 'Current PIN is required.' })
  @IsString({ message: 'Current PIN must be a string.' })
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits.' })
  currentPin!: string;

  @ApiProperty({
    description: 'New 6-digit numeric PIN',
    example: '739214',
  })
  @IsNotEmpty({ message: 'New PIN is required.' })
  @IsString({ message: 'New PIN must be a string.' })
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits.' })
  newPin!: string;
}
