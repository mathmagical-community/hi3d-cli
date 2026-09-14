# Changelog

## 2.1.0-rc.1 (pre-release, npm tag `next`)

- `hi3d-cli login --mode web` now authorizes in the browser: the CLI opens the site's authorization page, you approve while signed in, and the site hands the session back through a loopback redirect (PKCE S256, single-use code, state check). No password passes through the CLI. `--no-browser` prints the URL only (paste the redirected URL or code back on headless machines), `--port` pins the callback port, `--timeout` sets the wait (default 300 s).
- The account-password login stays available as an explicit fallback (`--account` / `--password`); `--cookie` is unchanged.

## 2.0.1

- Requests to Hi3D now carry a standard `User-Agent` of the form `hi3d-cli/<version> (cli | mcp-stdio | mcp-http)` instead of the version-less placeholder, on every request including `login` / `logout` and the MCP server. Nothing else is sent: no telemetry, no machine or user information.
- `who_am_i` returns a `client` block (version, channel, latest npm version, `update_available`, `update_command`); the MCP instructions ask agents to relay the update command, so users on old versions are nudged from inside Claude Code / Cursor as well as by the CLI's once-a-day stderr hint (off with `--no-update-check` / `HI3D_NO_UPDATE_CHECK=1` / `CI`).
- Release flow: versions are driven by `packages/hi3d-cli/package.json` (`X.Y.Z-rc.N` on develop → npm `next`, `X.Y.Z` on main → npm `latest`); `scripts/check-version.mjs` enforces consistency in CI.

## 2.0.0

- Headless Blender integration: new `blender_*` tools / commands (load, inspect, run_script, render_preview, export, session, scale_to_size, center, transform, decimate, repair, split_loose, join, delete_objects, apply_modifiers, hollow) and `retexture_model` (Hi3D `request_type=texture` for an edited GLB).
- Two backends, auto-detected: an installed Blender 4.2+ app (`blender -b --python`) or a managed `bpy` Python environment created by `hi3d-cli blender setup` (5.2 LTS / py3.13 by default; 5.0 / 4.5 / 4.2 on py3.11). `hi3d-cli blender status|doctor|use|uninstall|list`.
- Persistent scene per workspace (`<workspace>/.hi3d/session.blend`), path confinement (`--workspace`, `--allow-any-path`), `mcp --no-scripts`, `HI3D_DISABLE_BLENDER=1`.
- MCP: `blender_render_preview` returns the rendered PNGs as image content; tools carry annotations (read-only / destructive); server instructions describe the generate → edit → verify → export → retexture loop.
- CLI: `--workspace`, no-arg help, `blender_run_script @file.py`; the npm package ships `python/executor.py` (pure Python, no native deps).
- Tests: protocol / detection tests that need no Blender (`npm test`), real headless e2e (`npm run test:blender`), CI job with a cached bpy env.

## 1.0.1

- Uploads for web mode now use a built-in SigV4-style signed PUT; the third-party storage SDK dependency is gone (smaller bundle, no vendor code).
- Docs and comments no longer reference other vendors' CLIs.
- `npm publish` in CI is skipped when the version already exists on the registry.

## 1.0.0

- First release of `hi3d-cli`: single-file npm package (esbuild), Node ≥ 18, macOS / Windows / Linux.
- Login modes: Hi3D Open Platform AK/SK and hi3d.ai account (web), with named profiles (like `aws configure`) and env overrides.
- Commands (1:1 with MCP tools): `who_am_i`, `image_to_3d`, `query_task`, `download_asset`, `split_model`, `image_to_relief`, `multicolor_model`, `balance`, `tool_list`, `mcp`, `docs`.
- JSON output on stdout, progress on stderr, stable exit codes.
- MCP server (stdio and Streamable HTTP) and an agent skill (`skill/`).
