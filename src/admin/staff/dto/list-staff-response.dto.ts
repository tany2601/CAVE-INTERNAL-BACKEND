import { ApiProperty } from '@nestjs/swagger';
import { StaffDataDto } from './create-staff-response.dto.js';
import { PaginationMetaDto } from '../../branches/dto/list-branches-response.dto.js';

export class ListStaffResponseDto {
  @ApiProperty({ type: [StaffDataDto] })
  data!: StaffDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
