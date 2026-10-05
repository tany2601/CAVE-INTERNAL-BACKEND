import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BranchOpsService } from './branch.service.js';
import { CreateStaffExpenseDto } from './dto/create-staff-expense.dto.js';
import {
  CloseDayDto,
  CreatePayoutDto,
  SetChecklistItemDto,
  SetOpeningBalanceDto,
  StatsQueryDto,
} from './dto/staff-ops.dto.js';
import { CustomerLookupQueryDto } from './dto/customer-lookup-query.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Staff Branch Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff')
export class BranchOpsController {
  constructor(private readonly branchOps: BranchOpsService) {}

  @Get('menu')
  @Roles('STYLIST', 'MANAGER')
  @ApiOperation({ summary: 'Active service menu and prices for the branch' })
  getMenu(@Req() req: any) {
    return this.branchOps.getMenu(req.user);
  }

  @Get('products')
  @Roles('STYLIST', 'MANAGER')
  @ApiOperation({ summary: 'Active retail products offered at checkout' })
  getProducts() {
    return this.branchOps.getProducts();
  }

  @Get('today')
  @Roles('STYLIST', 'MANAGER')
  @ApiOperation({
    summary:
      "Today's stylists with stats, active/closed sessions and (managers only) expenses",
  })
  getToday(@Req() req: any) {
    return this.branchOps.getToday(req.user);
  }

  @Get('customers/lookup')
  @Roles('STYLIST', 'MANAGER')
  @ApiOperation({ summary: 'Loyalty progress for a customer phone number' })
  lookupCustomer(@Query() query: CustomerLookupQueryDto) {
    return this.branchOps.lookupCustomer(query.phone);
  }

  @Post('expenses')
  @HttpCode(HttpStatus.CREATED)
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Record a branch expense or employee advance' })
  createExpense(@Body() dto: CreateStaffExpenseDto, @Req() req: any) {
    return this.branchOps.createExpense(req.user, dto);
  }

  @Get('stats')
  @Roles('STYLIST', 'MANAGER')
  @ApiOperation({ summary: 'Stylist performance for today, this week or this month' })
  getStats(@Query() query: StatsQueryDto, @Req() req: any) {
    return this.branchOps.getStats(req.user, query.period);
  }

  @Put('day/opening')
  @Roles('MANAGER')
  @ApiOperation({ summary: "Record today's opening cash and GPay balances" })
  setOpening(@Body() dto: SetOpeningBalanceDto, @Req() req: any) {
    return this.branchOps.setOpeningBalance(req.user, dto);
  }

  @Post('day/close')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  @ApiOperation({ summary: "Verify the counted cash/GPay and close today's books" })
  closeDay(@Body() dto: CloseDayDto, @Req() req: any) {
    return this.branchOps.closeDay(req.user, dto);
  }

  @Post('payouts')
  @HttpCode(HttpStatus.CREATED)
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Record a commission payout or tip withdrawal for a stylist' })
  createPayout(@Body() dto: CreatePayoutDto, @Req() req: any) {
    return this.branchOps.createPayout(req.user, dto);
  }

  @Get('checklist')
  @Roles('STYLIST', 'MANAGER')
  @ApiOperation({ summary: "Today's checklist with completion state" })
  getChecklist(@Req() req: any) {
    return this.branchOps.getChecklist(req.user);
  }

  @Put('checklist/:taskId')
  @Roles('STYLIST', 'MANAGER')
  @ApiOperation({ summary: 'Tick or untick a checklist task for today' })
  setChecklistItem(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: SetChecklistItemDto,
    @Req() req: any,
  ) {
    return this.branchOps.setChecklistItem(req.user, taskId, dto.done);
  }
}
