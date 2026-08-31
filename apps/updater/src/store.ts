import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UpdateLogEvent, UpdateRun } from './domain.js';

export class AgentStore {
  constructor(private readonly root: string) {}

  async initialize() {
    await mkdir(join(this.root, 'runs'), { recursive: true, mode: 0o700 });
  }

  async takeInterruptedRun() {
    const lock = await this.readJson<{ runId?: string; pid?: number }>(join(this.root, 'update.lock'));
    if (!lock?.runId) return null;
    const run = await this.loadRun(lock.runId);
    await this.releaseLock();
    if (!run || terminal(run.status)) return null;
    return run;
  }

  async acquireLock(runId: string) {
    const path = join(this.root, 'update.lock');
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ runId, pid: process.pid, acquiredAt: new Date().toISOString() }));
      await handle.sync();
      await handle.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('UPDATE_IN_PROGRESS');
      throw error;
    }
  }

  async releaseLock() {
    await rm(join(this.root, 'update.lock'), { force: true });
  }

  async saveRun(run: UpdateRun) {
    await this.atomicJson(join(this.root, 'runs', `${run.id}.json`), run);
    await this.atomicJson(join(this.root, 'state.json'), { activeRunId: terminal(run.status) ? null : run.id, lastRunId: run.id });
  }

  async loadRun(id: string): Promise<UpdateRun | null> {
    if (!/^[a-f0-9-]{36}$/.test(id)) return null;
    return this.readJson<UpdateRun>(join(this.root, 'runs', `${id}.json`));
  }

  async findByIdempotencyKey(key: string): Promise<UpdateRun | null> {
    const entries = await readdir(join(this.root, 'runs'));
    for (const entry of entries) {
      const match = entry.match(/^([a-f0-9-]{36})\.json$/);
      if (!match) continue;
      const run = await this.loadRun(match[1]);
      if (run?.idempotencyKey === key) return run;
    }
    return null;
  }

  async appendEvent(runId: string, event: UpdateLogEvent) {
    const path = join(this.root, 'runs', `${runId}.jsonl`);
    const handle = await open(path, 'a', 0o600);
    await handle.writeFile(`${JSON.stringify(event)}\n`);
    await handle.sync();
    await handle.close();
  }

  async events(runId: string, afterSequence = 0): Promise<UpdateLogEvent[]> {
    if (!/^[a-f0-9-]{36}$/.test(runId)) return [];
    try {
      const content = await readFile(join(this.root, 'runs', `${runId}.jsonl`), 'utf8');
      return content.split('\n').filter(Boolean).map((line) => JSON.parse(line) as UpdateLogEvent).filter((event) => event.sequence > afterSequence);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async pruneRuns(keep = 200) {
    const entries = await readdir(join(this.root, 'runs'));
    const runs: UpdateRun[] = [];
    for (const entry of entries) {
      const match = entry.match(/^([a-f0-9-]{36})\.json$/);
      if (!match) continue;
      const run = await this.loadRun(match[1]);
      if (run && terminal(run.status)) runs.push(run);
    }
    runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    for (const run of runs.slice(Math.max(1, keep))) {
      await Promise.all([
        rm(join(this.root, 'runs', `${run.id}.json`), { force: true }),
        rm(join(this.root, 'runs', `${run.id}.jsonl`), { force: true }),
      ]);
    }
  }

  private async atomicJson(path: string, value: unknown) {
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    const handle = await open(temporary, 'r');
    await handle.sync();
    await handle.close();
    await rename(temporary, path);
  }

  private async readJson<T>(path: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

function terminal(status: UpdateRun['status']) {
  return ['COMPLETED', 'FAILED', 'MANUAL_INTERVENTION_REQUIRED', 'CANCELLED'].includes(status);
}
