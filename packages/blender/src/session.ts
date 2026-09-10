/**
 * BlenderSession: one lazily started executor bound to a workspace, with a persisted scene
 * (<workspace>/.hi3d/session.blend) so CLI one-shot commands and MCP server restarts share state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BackendInfo, resolveBackend } from './detect.js';
import { BlenderError } from './errors.js';
import { BlenderExecutor } from './executor.js';

export interface SessionOptions {
  workspace: string;
  confinePaths?: boolean;
  log?: (m: string) => void;
  idleMinutes?: number;
  backend?: BackendInfo;
}

export class BlenderSession {
  readonly workspace: string;
  readonly stateDir: string;
  readonly sessionFile: string;
  readonly rendersDir: string;
  readonly confinePaths: boolean;
  readonly log: (m: string) => void;
  private exec?: BlenderExecutor;
  private opened = false;
  private idleTimer?: NodeJS.Timeout;
  private readonly idleMs: number;
  private backendOverride?: BackendInfo;

  constructor(o: SessionOptions) {
    this.workspace = path.resolve(o.workspace);
    this.stateDir = path.join(this.workspace, '.hi3d');
    this.sessionFile = path.join(this.stateDir, 'session.blend');
    this.rendersDir = path.join(this.stateDir, 'renders');
    this.confinePaths = o.confinePaths ?? true;
    this.log = o.log ?? (() => {});
    this.idleMs = (o.idleMinutes ?? Number(process.env.HI3D_BLENDER_IDLE_MIN ?? 15)) * 60_000;
    this.backendOverride = o.backend;
  }

  /** Resolve a user-supplied path inside the workspace (unless confinement is off). */
  resolve(p: string, mustExist = false): string {
    const abs = path.resolve(this.workspace, p);
    if (this.confinePaths) {
      const rel = path.relative(this.workspace, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new BlenderError(`path is outside the workspace: ${p} (workspace ${this.workspace}; start the MCP server with --allow-any-path to disable)`, 'PATH_OUTSIDE_WORKSPACE');
    }
    if (mustExist && !fs.existsSync(abs)) throw new BlenderError(`file not found: ${abs}`, 'BLENDER_OP_FAILED');
    return abs;
  }

  backend(): BackendInfo {
    if (this.backendOverride) return this.backendOverride;
    const r = resolveBackend();
    if (!r.backend) throw new BlenderError(r.hint!, 'BLENDER_NOT_AVAILABLE', { candidates: r.candidates });
    this.backendOverride = r.backend;
    return r.backend;
  }

  private executor(): BlenderExecutor {
    if (this.exec && this.exec.alive) return this.exec;
    this.exec = new BlenderExecutor({ backend: this.backend(), cwd: this.workspace, log: this.log });
    this.opened = false;
    return this.exec;
  }

  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.idleMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.log('[blender] idle, stopping executor (state kept in session.blend)');
        this.close();
      }, this.idleMs);
      this.idleTimer.unref();
    }
  }

  /** Call an executor op; opens the session file on first use. */
  async call<T = unknown>(op: string, args: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    const ex = this.executor();
    if (!this.opened) {
      fs.mkdirSync(this.stateDir, { recursive: true });
      await ex.call('session', { action: 'open', path: this.sessionFile });
      this.opened = true;
    }
    this.touch();
    return ex.call<T>(op, args, timeoutMs);
  }

  info() {
    return { workspace: this.workspace, session_file: this.sessionFile, session_exists: fs.existsSync(this.sessionFile), executor_running: !!this.exec?.alive, backend: this.backendOverride ?? null };
  }

  close(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.exec?.close();
    this.exec = undefined;
    this.opened = false;
  }
}
