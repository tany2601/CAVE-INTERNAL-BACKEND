import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CustomerLookupQueryDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty({ message: 'phone is required.' })
  @Matches(/^[+\d][\d\s-]{6,19}$/, { message: 'Invalid phone number.' })
  phone!: string;
}
