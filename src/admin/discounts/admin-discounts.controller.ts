import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdminDiscountsService } from './admin-discounts.service.js';
import { SaveBranchDiscountDto } from './dto/save-discount.dto.js';

@ApiTags('Admin Discounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/discounts')
export class AdminDiscountsController {
  constructor(private readonly discounts: AdminDiscountsService) {}

  @Get()
  @ApiOperation({ summary: 'Every branch with its discount settings' })
  list() {
    return this.discounts.list();
  }

  @Put(':branchId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Turn a branch\'s discount on or off and set its services / products discount' })
  save(@Param('branchId', new ParseUUIDPipe()) branchId: string, @Body() dto: SaveBranchDiscountDto) {
    return this.discounts.save(branchId, dto);
  }
}
