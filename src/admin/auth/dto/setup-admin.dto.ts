import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class SetupAdminDto {
  @ApiProperty({
    example: 'CAVE Admin',
    description: 'Full name of the primary administrator',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'admin@cave.com',
    description: 'Unique email address of the administrator',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: '482613',
    description: 'Exactly 6 numeric digits PIN',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits' })
  pin!: string;
}
