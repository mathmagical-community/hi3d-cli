/** Node driver for python/executor.py: spawn (app or python), handshake, JSON-lines calls, timeouts. */
import { ChildProcess } from 'node:child_process';
import { spawnX as spawn } from './spawn.js';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { BackendInfo } from './detect.js';
import { BlenderError } from './errors.js';
import { blenderHome, executorScriptPath } from './paths.js';

const PREFIX = 'HI3D:';

export interface ExecutorOptions {
  backend: BackendInfo;
  cwd?: string;
  log?: (m: string) => void;
  /** ms to wait for the ready handshake (app backend cold start can take a while) */
  startTimeoutMs?: number;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  op: string;
}

export function launchArgs(backend: BackendInfo): string[] {
  const script = executorScriptPath();
  if (backend.kind === 'app') {
    return [...backend.command, '-b', '--factory-startup', '--disable-autoexec', '-noaudio', '--python-exit-code', '1', '--python', script, '--', '--channel', 'stdio'];
  }
  return [...backend.command, '-u', script, '--channel', 'stdio'];
}

export class BlenderExecutor {
  readonly backend: BackendInfo;
  readonly cwd: string;
  readonly log: (m: string) => void;
  private proc?: ChildProcess;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private ready?: Promise<Record<string, unknown>>;
  private readyInfo?: Record<string, unknown>;
  private readonly startTimeoutMs: number;
  private logFile?: fs.WriteStream;
  lastUsed = Date.now();

  constructor(o: ExecutorOptions) {
    this.backend = o.backend;
    this.cwd = o.cwd ?? process.cwd();
    this.log = o.log ?? (() => {});
    this.startTimeoutMs = o.startTimeoutMs ?? 180_000;
  }

  get alive(): boolean {
    return !!this.proc && this.proc.exitCode === null && !this.proc.killed;
  }
  get info(): Record<string, unknown> | undefined {
    return this.readyInfo;
  }

  /** Start the process (idempotent) and wait for the ready handshake. */
  start(): Promise<Record<string, unknown>> {
    if (this.alive && this.ready) return this.ready;
    const argv = launchArgs(this.backend);
    this.log(`[blender] starting ${this.backend.kind}: ${argv.join(' ')}`);
    try {
      const logDir = path.join(blenderHome(), 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      this.logFile = fs.createWriteStream(path.join(logDir, `executor-${Date.now()}.log`));
      // keep only the newest 5 logs
      for (const f of fs.readdirSync(logDir).filter((n) => n.startsWith('executor-')).sort().reverse().slice(5)) fs.rmSync(path.join(logDir, f), { force: true });
    } catch {
      /* logging is best effort */
    }
    const proc = spawn(argv[0], argv.slice(1), {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', LIBGL_ALWAYS_SOFTWARE: process.env.LIBGL_ALWAYS_SOFTWARE ?? '1' },
    });
    this.proc = proc;
    this.ready = new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new BlenderError(`Blender executor did not start within ${this.startTimeoutMs / 1000}s`, 'BLENDER_START_FAILED')), this.startTimeoutMs);
      const rl = readline.createInterface({ input: proc.stdout! });
      rl.on('line', (line) => {
        if (!line.startsWith(PREFIX)) {
          if (line.trim()) this.log(`[blender] ${line}`);
          return;
        }
        let msg: { id?: number; ok?: boolean; result?: unknown; error?: { type: string; message: string; trace?: string }; event?: string; msg?: string };
        try {
          msg = JSON.parse(line.slice(PREFIX.length));
        } catch {
          this.log(`[blender] bad protocol line: ${line.slice(0, 200)}`);
          return;
        }
        if (msg.event === 'ready') {
          clearTimeout(t);
          this.readyInfo = msg as Record<string, unknown>;
          resolve(this.readyInfo);
          return;
        }
        if (msg.event === 'log') {
          this.log(`[blender] ${msg.msg}`);
          return;
        }
        const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
        if (!p) return;
        this.pending.delete(msg.id!);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new BlenderError(`${p.op}: ${msg.error?.type ?? 'Error'}: ${msg.error?.message ?? 'unknown'}`, 'BLENDER_OP_FAILED', { trace: msg.error?.trace }));
      });
      proc.stderr!.on('data', (d) => {
        this.logFile?.write(d);
        if (process.env.HI3D_DEBUG) this.log(`[blender:stderr] ${String(d).trimEnd()}`);
      });
      proc.on('error', (e) => {
        clearTimeout(t);
        reject(new BlenderError(`failed to start ${argv[0]}: ${e.message}`, 'BLENDER_START_FAILED'));
      });
      proc.on('exit', (code, sig) => {
        clearTimeout(t);
        const err = new BlenderError(`Blender executor exited (code ${code}, signal ${sig})`, 'BLENDER_START_FAILED');
        reject(err);
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(err);
        }
        this.pending.clear();
        this.logFile?.end();
      });
    });
    return this.ready;
  }

  async call<T = unknown>(op: string, args: Record<string, unknown> = {}, timeoutMs = 30 * 60 * 1000): Promise<T> {
    await this.start();
    this.lastUsed = Date.now();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BlenderError(`${op} timed out after ${Math.round(timeoutMs / 1000)}s`, 'BLENDER_TIMEOUT'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, op });
      this.proc!.stdin!.write(JSON.stringify({ id, op, args }) + '\n');
    });
  }

  close(): void {
    if (!this.proc) return;
    try {
      this.proc.stdin?.end();
    } catch {
      /* ignore */
    }
    const p = this.proc;
    setTimeout(() => {
      if (p.exitCode === null) p.kill();
    }, 3000).unref();
    this.proc = undefined;
    this.ready = undefined;
  }
}
