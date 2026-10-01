import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsBoolean } from 'class-validator';

export class UpdateBranchStatusDto {
  @ApiProperty({
    example: false,
    description: 'Active status of the branch (true to activate, false to deactivate)',
  })
  @IsNotEmpty({ message: 'isActive status is required.' })
  @IsBoolean({ message: 'isActive must be a boolean value.' })
  isActive!: boolean;
}
