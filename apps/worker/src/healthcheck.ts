import { readFile } from 'node:fs/promises';

const path = process.env.WORKER_HEALTH_FILE ?? '/tmp/pe-community-worker-ready';
const value = Number((await readFile(path, 'utf8')).trim());
if (!Number.isSafeInteger(value) || Math.abs(Date.now() - value) > 45_000) {
  process.exitCode = 1;
}
