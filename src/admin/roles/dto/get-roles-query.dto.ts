import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class GetRolesQueryDto {
  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'If true, includes ADMIN role. If false (default), returns only MANAGER and STYLIST roles.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'includeAdmin must be a boolean value.' })
  includeAdmin?: boolean = false;
}
