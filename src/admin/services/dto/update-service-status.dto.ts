import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateServiceStatusDto {
  @ApiProperty({
    example: false,
    description: 'Active status of the service (true to activate, false to deactivate)',
  })
  @IsNotEmpty({ message: 'isActive status is required.' })
  @IsBoolean({ message: 'isActive must be a boolean.' })
  isActive!: boolean;
}
