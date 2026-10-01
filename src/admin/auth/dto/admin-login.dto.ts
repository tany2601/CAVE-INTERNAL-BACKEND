import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit numeric Admin PIN',
  })
  @IsNotEmpty({ message: 'PIN is required.' })
  @IsString({ message: 'PIN must be a string.' })
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits.' })
  pin!: string;
}
