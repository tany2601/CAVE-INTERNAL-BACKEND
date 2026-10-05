import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminReportsService } from './admin-reports.service.js';
import {
  BranchScopeQueryDto,
  CustomersReportQueryDto,
  MonthlyReportQueryDto,
  ReportRangeQueryDto,
  SessionsReportQueryDto,
} from './dto/report-queries.dto.js';
import { RevenueSummaryQueryDto } from './dto/revenue-summary-query.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get('revenue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Completed-session revenue for a period, per branch' })
  getRevenue(@Query() query: RevenueSummaryQueryDto) {
    return this.reports.getRevenueSummary(query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard totals, branch pulse, weekly revenue and top services' })
  getOverview(@Query() query: ReportRangeQueryDto) {
    return this.reports.getOverview(query);
  }

  @Get('branches/:branchId/summary')
  @ApiOperation({ summary: 'Daily reconciliation for one branch' })
  getBranchSummary(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.getBranchSummary(branchId, query);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Chronological completed-session feed with totals' })
  getSessions(@Query() query: SessionsReportQueryDto) {
    return this.reports.getSessions(query);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer directory with spend, visits and favourite service' })
  getCustomers(@Query() query: CustomersReportQueryDto) {
    return this.reports.getCustomers(query);
  }

  @Get('retention')
  @ApiOperation({ summary: 'Retention rate, windows and loyalty leaderboard' })
  getRetention(@Query() query: BranchScopeQueryDto) {
    return this.reports.getRetention(query);
  }

  @Get('employees')
  @ApiOperation({ summary: 'Team payroll position and performance' })
  getEmployees(@Query() query: ReportRangeQueryDto) {
    return this.reports.getEmployees(query);
  }

  @Get('commission')
  @ApiOperation({ summary: 'Commission earned, paid and pending per stylist' })
  getCommission(@Query() query: ReportRangeQueryDto) {
    return this.reports.getCommission(query);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Monthly tracker: branch table, calendar and day reconciliation' })
  getMonthly(@Query() query: MonthlyReportQueryDto) {
    return this.reports.getMonthly(query);
  }
}
