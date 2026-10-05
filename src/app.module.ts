import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { HealthModule } from './health/health.module.js';
import { AdminModule } from './admin/admin.module.js';
import { BranchAuthModule } from './auth/branch/branch-auth.module.js';
import { SessionsModule } from './staff/sessions/sessions.module.js';
import { BranchOpsModule } from './staff/branch/branch.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SupabaseModule,
    HealthModule,
    AdminModule,
    BranchAuthModule,
    SessionsModule,
    BranchOpsModule,
  ],
})
export class AppModule {}
