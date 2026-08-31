import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type CommandResult = { stdout: string; stderr: string };
export type CommandOutput = { stream: 'stdout' | 'stderr'; chunk: string };

export type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdinPath?: string;
  onOutput?: (output: CommandOutput) => void;
  maxOutputBytes?: number;
};

export interface CommandExecutor {
  run(executable: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult>;
  capture(executable: string, args: readonly string[], outputPath: string, options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<{ stderr: string }>;
}

export class ProcessCommandExecutor implements CommandExecutor {
  async run(executable: string, args: readonly string[], options: CommandOptions = {}) {
    if (options.stdinPath) return runWithInput(executable, args, options.stdinPath, options);
    if (options.onOutput) return runStreaming(executable, args, options);
    const result = await execFileAsync(executable, [...args], {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: options.maxOutputBytes ?? 8 * 1024 * 1024,
      encoding: 'utf8',
    });
    return { stdout: result.stdout, stderr: result.stderr };
  }

  capture(executable: string, args: readonly string[], outputPath: string, options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}) {
    return new Promise<{ stderr: string }>((resolve, reject) => {
      const child = spawn(executable, [...args], { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
      const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs ?? 10 * 60_000);
      child.stdout.pipe(output);
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8').slice(0, 100_000); });
      let childClosed = false;
      let outputClosed = false;
      let exitCode: number | null = null;
      let settled = false;
      const finish = () => {
        if (settled || !childClosed || !outputClosed) return;
        settled = true;
        clearTimeout(timer);
        if (exitCode === 0) resolve({ stderr });
        else reject(new Error(`Command failed with exit code ${exitCode}: ${stderr.slice(-2_000)}`));
      };
      child.on('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); output.destroy(); reject(error); } });
      output.on('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); child.kill('SIGTERM'); reject(error); } });
      output.on('close', () => { outputClosed = true; finish(); });
      child.on('close', (code) => {
        childClosed = true;
        exitCode = code;
        finish();
      });
    });
  }
}

function runStreaming(executable: string, args: readonly string[], options: CommandOptions) {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, [...args], { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs ?? 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      const value = chunk.toString('utf8');
      stdout = boundedAppend(stdout, value);
      options.onOutput?.({ stream: 'stdout', chunk: value });
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const value = chunk.toString('utf8');
      stderr = boundedAppend(stderr, value);
      options.onOutput?.({ stream: 'stderr', chunk: value });
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed with exit code ${code}: ${stderr.slice(-2_000)}`));
    });
  });
}

async function runWithInput(
  executable: string,
  args: readonly string[],
  inputPath: string,
  options: CommandOptions,
) {
  const input = await open(inputPath, 'r');
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, [...args], { cwd: options.cwd, env: options.env, stdio: [input.fd, 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs ?? 120_000);
    child.stdout!.on('data', (chunk: Buffer) => {
      const value = chunk.toString('utf8');
      stdout = boundedAppend(stdout, value);
      options.onOutput?.({ stream: 'stdout', chunk: value });
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      const value = chunk.toString('utf8');
      stderr = boundedAppend(stderr, value);
      options.onOutput?.({ stream: 'stderr', chunk: value });
    });
    child.on('error', (error) => { clearTimeout(timer); void input.close(); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      void input.close();
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed with exit code ${code}: ${stderr.slice(-2_000)}`));
    });
  });
}

function boundedAppend(current: string, value: string) {
  const limit = 8 * 1024 * 1024;
  return current.length >= limit ? current : `${current}${value}`.slice(0, limit);
}
