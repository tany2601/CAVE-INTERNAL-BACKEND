import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateChecklistTaskDto {
  @ApiProperty({ example: 'Sanitize chairs' })
  @IsString()
  @IsNotEmpty({ message: 'Task is required.' })
  @MaxLength(200)
  @Transform(trim)
  task!: string;

  @ApiPropertyOptional({ example: 'Wipe down with disinfectant' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional({ description: 'Restrict the task to one branch (all branches if omitted)' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}

export class UpdateChecklistTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Task cannot be empty.' })
  @MaxLength(200)
  @Transform(trim)
  task?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  description?: string;
}
