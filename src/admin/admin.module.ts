import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PinModule } from '../common/security/pin.module.js';
import { AdminAuthController } from './auth/admin-auth.controller.js';
import { AdminAuthService } from './auth/admin-auth.service.js';
import { AdminBranchesController } from './branches/admin-branches.controller.js';
import { AdminBranchesService } from './branches/admin-branches.service.js';
import { AdminRolesController } from './roles/admin-roles.controller.js';
import { AdminRolesService } from './roles/admin-roles.service.js';
import { AdminStaffController } from './staff/admin-staff.controller.js';
import { AdminStaffService } from './staff/admin-staff.service.js';
import { AdminServicesController } from './services/admin-services.controller.js';
import { AdminServicesService } from './services/admin-services.service.js';
import { AdminMenuPricingController } from './menu-pricing/admin-menu-pricing.controller.js';
import { AdminMenuPricingService } from './menu-pricing/admin-menu-pricing.service.js';
import { AdminTransactionsController } from './transactions/admin-transactions.controller.js';
import { AdminTransactionsService } from './transactions/admin-transactions.service.js';
import { AdminReportsController } from './reports/admin-reports.controller.js';
import { AdminReportsService } from './reports/admin-reports.service.js';
import { AdminSalaryPaymentsController } from './salary-payments/admin-salary-payments.controller.js';
import { AdminSalaryPaymentsService } from './salary-payments/admin-salary-payments.service.js';
import { AdminChecklistController } from './checklist/admin-checklist.controller.js';
import { AdminChecklistService } from './checklist/admin-checklist.service.js';
import { AdminUploadsController } from './uploads/admin-uploads.controller.js';
import { AdminUploadsService } from './uploads/admin-uploads.service.js';
import { AdminProductsController } from './products/admin-products.controller.js';
import { AdminProductsService } from './products/admin-products.service.js';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

@Module({
  imports: [PrismaModule, PinModule, ConfigModule, SupabaseModule],
  controllers: [
    AdminAuthController,
    AdminBranchesController,
    AdminRolesController,
    AdminStaffController,
    AdminServicesController,
    AdminMenuPricingController,
    AdminTransactionsController,
    AdminReportsController,
    AdminSalaryPaymentsController,
    AdminChecklistController,
    AdminUploadsController,
    AdminProductsController,
  ],
  providers: [
    AdminAuthService,
    AdminBranchesService,
    AdminRolesService,
    AdminStaffService,
    AdminServicesService,
    AdminMenuPricingService,
    AdminTransactionsService,
    AdminReportsService,
    AdminSalaryPaymentsService,
    AdminChecklistService,
    AdminUploadsService,
    AdminProductsService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AdminAuthService,
    AdminBranchesService,
    AdminRolesService,
    AdminStaffService,
    AdminServicesService,
    AdminMenuPricingService,
    AdminTransactionsService,
  ],
})
export class AdminModule {}

