import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class BranchLoginDto {
  @ApiProperty({
    example: '1234',
    description: '4-digit numeric login PIN for branch role authentication',
  })
  @IsString({ message: 'PIN must be a string.' })
  @IsNotEmpty({ message: 'PIN is required.' })
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 numeric digits.' })
  pin!: string;
}
