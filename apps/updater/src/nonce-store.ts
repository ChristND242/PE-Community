import { open, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const NONCE_TTL_MS = 60_000;
const MAX_NONCES = 4_096;

export class ReplayNonceStore {
  private readonly path: string;
  private loaded = false;
  private entries = new Map<string, number>();
  private queue = Promise.resolve();

  constructor(stateDirectory: string) {
    this.path = join(stateDirectory, 'request-nonces.json');
  }

  consume(nonce: string, timestamp: number, now = Date.now()) {
    const operation = this.queue.then(() =>
      this.consumeLocked(nonce, timestamp, now),
    );
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async consumeLocked(nonce: string, timestamp: number, now: number) {
    if (!this.loaded) await this.load(now);
    this.prune(now);
    if (this.entries.has(nonce)) throw new Error('REPLAYED_NONCE');
    if (this.entries.size >= MAX_NONCES) {
      const oldest = [...this.entries.entries()].sort(
        (left, right) => left[1] - right[1],
      )[0];
      if (oldest) this.entries.delete(oldest[0]);
    }
    this.entries.set(nonce, timestamp);
    await this.persist();
  }

  private async load(now: number) {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed.slice(-MAX_NONCES)) {
          if (
            Array.isArray(entry) &&
            typeof entry[0] === 'string' &&
            /^[a-f0-9]{64}$/.test(entry[0]) &&
            Number.isSafeInteger(entry[1])
          ) {
            this.entries.set(entry[0], Number(entry[1]));
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.loaded = true;
    this.prune(now);
  }

  private prune(now: number) {
    for (const [nonce, timestamp] of this.entries) {
      if (timestamp < now - NONCE_TTL_MS || timestamp > now + NONCE_TTL_MS)
        this.entries.delete(nonce);
    }
  }

  private async persist() {
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify([...this.entries])}\n`, {
      mode: 0o600,
    });
    const handle = await open(temporary, 'r');
    await handle.sync();
    await handle.close();
    await rename(temporary, this.path);
  }
}
