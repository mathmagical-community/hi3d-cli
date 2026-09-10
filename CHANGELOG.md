# Changelog

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
