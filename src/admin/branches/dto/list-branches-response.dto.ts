import { ApiProperty } from '@nestjs/swagger';
import { BranchDataDto } from './create-branch-response.dto.js';

export class PaginationMetaDto {
  @ApiProperty({ example: 42, description: 'Total count of matching records' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  page!: number;

  @ApiProperty({ example: 10, description: 'Number of items per page' })
  limit!: number;

  @ApiProperty({ example: 5, description: 'Total number of pages' })
  totalPages!: number;
}

export class ListBranchesResponseDto {
  @ApiProperty({ type: [BranchDataDto] })
  data!: BranchDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
