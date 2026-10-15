import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString =
      configService.get<string>('DATABASE_URL') ||
      'postgresql://postgres:postgres@localhost:5432/cave_db';
    const isRemote =
      connectionString.includes('supabase') ||
      connectionString.includes('sslmode=') ||
      process.env.NODE_ENV === 'production';
    // Supabase's session pooler allows only a small number of connections in total (15 on the free plan),
    // shared by every server using the same database: your laptop and the live server count together.
    // So each server keeps its own pool small. Set DB_POOL_MAX (e.g. 4 on a laptop, 8 on the live server)
    // so the totals stay under the limit.
    const configured = Number(configService.get<string>('DB_POOL_MAX'));
    const max = Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : isRemote ? 5 : 10;
    const pool = new pg.Pool({
      connectionString,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
      max,
      idleTimeoutMillis: 10_000, // give connections back quickly when quiet
      connectionTimeoutMillis: 15_000,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && dbUrl.trim() !== '') {
      try {
        await (this as PrismaClient).$connect();
      } catch (error) {
        console.warn('Prisma DB connection warning:', (error as Error).message);
      }
    }
  }

  async onModuleDestroy() {
    await (this as PrismaClient).$disconnect();
  }
}
