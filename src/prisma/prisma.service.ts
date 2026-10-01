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
    const pool = new pg.Pool({
      connectionString,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
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
