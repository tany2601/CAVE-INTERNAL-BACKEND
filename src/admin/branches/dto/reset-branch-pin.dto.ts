import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class ResetBranchPinDto {
  @ApiPropertyOptional({
    example: '123456',
    description: 'Optional new 6-digit numeric PIN. Automatically generated if omitted.',
  })
  @IsOptional()
  @IsString({ message: 'PIN must be a string.' })
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits.' })
  newPin?: string;
}
