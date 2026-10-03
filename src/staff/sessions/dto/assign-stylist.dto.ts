import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class AssignStylistDto {
  @ApiProperty({
    description: 'UUID of the staff member (User) to assign as the session stylist',
    example: 'u1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID('4', { message: 'stylistId must be a valid UUID v4.' })
  @IsNotEmpty({ message: 'stylistId is required.' })
  stylistId: string;
}
