import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig, env } from 'prisma/config';

if (!process.env.DATABASE_URL && existsSync('.env')) {
  loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
