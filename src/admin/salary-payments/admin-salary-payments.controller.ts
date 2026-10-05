import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { AdminSalaryPaymentsService } from './admin-salary-payments.service.js';
import { CreateSalaryPaymentDto } from './admin-salary-payments.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

class ListSalaryPaymentsQuery {
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}

@ApiTags('Admin Payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/salary-payments')
export class AdminSalaryPaymentsController {
  constructor(private readonly service: AdminSalaryPaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a salary payment to an employee' })
  create(@Body() dto: CreateSalaryPaymentDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Recent salary payments' })
  list(@Query() query: ListSalaryPaymentsQuery) {
    return this.service.list(query);
  }
}
