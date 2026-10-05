import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminProductsService } from './admin-products.service.js';
import { CreateProductDto, UpdateProductDto } from './admin-products.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly service: AdminProductsService) {}

  @Get()
  @ApiOperation({ summary: 'All products (active and inactive)' })
  list() {
    return this.service.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a product' })
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a product (including hiding it from billing)' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
