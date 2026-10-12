import { Logger } from '@nestjs/common';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from './prisma.service.js';

/**
 * Warns loudly at startup when the database is behind the code (a migration was not applied). Without
 * this the first symptom is an unexplained "Internal server error" on whatever feature uses the new tables.
 * Never stops the app: it only logs what to run.
 */
export async function warnAboutPendingMigrations(prisma: PrismaService): Promise<string[]> {
  const logger = new Logger('Database');
  try {
    const dir = join(process.cwd(), 'prisma', 'migrations');
    if (!existsSync(dir)) return [];
    const onDisk = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    const done = new Set(applied.map((r) => r.migration_name));
    const pending = onDisk.filter((m) => !done.has(m)).sort();
    if (pending.length) {
      logger.error(
        `The database is missing ${pending.length} update(s): ${pending.join(', ')}. ` +
          'Run "npx prisma migrate deploy" (deploy.sh does this) or features using them will fail with "Internal server error".',
      );
    }
    return pending;
  } catch (e) {
    logger.warn(`Could not check database migrations: ${(e as Error).message}`);
    return [];
  }
}
