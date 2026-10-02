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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

@Module({
  imports: [PrismaModule, PinModule, ConfigModule],
  controllers: [
    AdminAuthController,
    AdminBranchesController,
    AdminRolesController,
    AdminStaffController,
    AdminServicesController,
    AdminMenuPricingController,
    AdminTransactionsController,
  ],
  providers: [
    AdminAuthService,
    AdminBranchesService,
    AdminRolesService,
    AdminStaffService,
    AdminServicesService,
    AdminMenuPricingService,
    AdminTransactionsService,
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

