import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminTransactionsService } from './admin-transactions.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';
import { TransactionsSummaryQueryDto } from './dto/transactions-summary-query.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Transactions')
@Controller('admin/transactions')
export class AdminTransactionsController {
  constructor(
    private readonly adminTransactionsService: AdminTransactionsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new branch expense or employee advance' })
  @ApiResponse({
    status: 201,
    description: 'Transaction created successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input, inactive branch/employee, or conditional validation failure',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Branch or employee not found' })
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @Req() req: any,
  ) {
    const createdById = req.user?.id || req.user?.sub;
    return this.adminTransactionsService.createTransaction(dto, createdById);
  }

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get aggregated branch expense and advance summary' })
  @ApiResponse({
    status: 200,
    description: 'Transaction summary retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async getTransactionSummary(@Query() query: TransactionsSummaryQueryDto) {
    return this.adminTransactionsService.getTransactionSummary(query);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List transactions with filters and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  async listTransactions(@Query() query: ListTransactionsQueryDto) {
    return this.adminTransactionsService.listTransactions(query);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update transaction description, amount, or payment mode' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the transaction to update',
    example: 't1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or input' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have ADMIN role',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async updateTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.adminTransactionsService.updateTransaction(id, dto);
  }
}
