/** `hi3d-cli blender setup|status|doctor|use|uninstall` — managing the headless Blender backend. */
import { Command } from 'commander';
import { blenderDoctor, blenderStatus, detectBackends, removeManagedEnv, setupManagedEnv, BlenderSession, installableReleases} from '@hi3d/blender';
import { saveConfig, loadConfig } from '@hi3d/core';

export function registerBlenderCommands(program: Command, emit: (b: unknown) => void, fail: (e: unknown) => never, log: (m: string) => void) {
  const b = program.command('blender').description('Headless Blender backend: setup (managed bpy env), status, doctor, use, uninstall');
  const ctx = () => ({ session: () => new BlenderSession({ workspace: program.opts().workspace ?? process.cwd(), confinePaths: !program.opts().allowAnyPath, log }), log });

  b.command('status')
    .description('Which Blender backend would be used (installed app or managed bpy env) and how to get one')
    .option('--refresh', 're-probe instead of using the cache')
    .option('--deep', 'also probe every python on PATH')
    .action((o) => {
      try {
        emit(blenderStatus({ refresh: !!o.refresh, deep: !!o.deep }, ctx()));
      } catch (e) {
        fail(e);
      }
    });

  b.command('doctor')
    .description('Probe all candidates, start the executor, render a test cube and export a GLB')
    .action(async () => {
      const c = ctx();
      const s = c.session();
      try {
        emit(await blenderDoctor({ session: () => s, log }));
      } catch (e) {
        fail(e);
      } finally {
        s.close();
      }
    });

  b.command('setup')
    .description('Create a managed Python env with the bpy wheel (~300 MB download); not needed if Blender is installed')
    .option('--bpy <major.minor>', `bpy version (${installableReleases().map((r) => r.bpy).join(', ') || 'none for this platform'})`)
    .option('--python <path>', 'Python interpreter to use (must match the bpy version: 5.x → 3.13, 4.x → 3.11)')
    .option('--force', 'recreate the env if it exists')
    .option('--quiet', 'no progress on stderr')
    .action(async (o) => {
      try {
        emit(await setupManagedEnv({ bpy: o.bpy, python: o.python, force: !!o.force, log, quiet: !!o.quiet }));
      } catch (e) {
        fail(e);
      }
    });

  b.command('use')
    .description('Pin the backend: a Blender executable path, a managed env dir, or "auto"')
    .argument('<path-or-auto>')
    .action((p: string) => {
      try {
        const cfg = loadConfig();
        if (p === 'auto') delete cfg.blender;
        else cfg.blender = p;
        saveConfig(cfg);
        emit({ blender: cfg.blender ?? 'auto', status: blenderStatus({ refresh: true }) });
      } catch (e) {
        fail(e);
      }
    });

  b.command('uninstall')
    .description('Remove managed bpy env(s) under ~/.hi3d/blender/envs')
    .option('--bpy <major.minor>', 'only this version')
    .action((o) => {
      try {
        emit({ removed: removeManagedEnv(o.bpy) });
      } catch (e) {
        fail(e);
      }
    });

  b.command('list')
    .description('List every Blender candidate found on this machine')
    .action(() => {
      try {
        emit(detectBackends({ refresh: true, deep: true }));
      } catch (e) {
        fail(e);
      }
    });
}
