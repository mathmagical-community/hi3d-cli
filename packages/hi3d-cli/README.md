# hi3d-cli

<p align="center">
  <a href="https://www.npmjs.com/package/@hi3d/hi3d-cli"><img alt="npm" src="https://img.shields.io/npm/v/%40hi3d%2Fhi3d-cli?label=npm"></a>
  <a href="https://github.com/mathmagical-community/hi3d-cli/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/mathmagical-community/hi3d-cli/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="node" src="https://img.shields.io/node/v/%40hi3d%2Fhi3d-cli">
  <img alt="platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

**Image → 3D from your terminal and your AI agent.** `hi3d-cli` is the command-line client and MCP server for
[Hi3D](https://hi3d.ai): generate production-ready 3D models from images, then (2.0) inspect, repair, decimate,
scale, preview-render, export and re-texture them with a **headless Blender** — no Blender window, no GPU.

English · [中文文档](README.zh-CN.md) · [Wiki](https://github.com/mathmagical-community/hi3d-cli/wiki)

- Works on **macOS, Windows and Linux**; pure JavaScript, Node ≥ 18; one `npm i -g` or `npx`.
- **Same names everywhere**: every CLI command is an MCP tool with identical parameters; every command prints one JSON document.
- Built for agents: Claude Code, Codex, Cursor, Trae / Doubao, OpenClaw, Gemini CLI, OpenCode, Cline, Claude Desktop, … (see [Use with AI agents](#use-with-ai-agents)).

```bash
npm i -g @hi3d/hi3d-cli
hi3d-cli login                                   # Open Platform AK/SK or a hi3d.ai account
hi3d-cli image_to_3d ./cat.png --poll --download  # → hi3d-out/cat.glb
hi3d-cli blender_load hi3d-out/cat.glb && hi3d-cli blender_scale_to_size 80 && hi3d-cli blender_export out/cat_80mm.glb
```

## Contents

1. [Install](#1-install)
2. [Log in and configure](#2-log-in-and-configure)
3. [Generate models](#3-generate-models)
4. [Edit with Blender (2.0)](#4-edit-with-blender-20)
5. [Use with AI agents](#use-with-ai-agents)
6. [Output, exit codes, environment variables](#6-output-exit-codes-environment-variables)
7. [Credits](#7-credits)
8. [Troubleshooting](#8-troubleshooting)
9. [Development and releases](#9-development-and-releases)

## 1. Install

Requires [Node.js](https://nodejs.org) 18 or newer (`node -v`).

| OS | Command |
|---|---|
| macOS / Linux | `npm i -g @hi3d/hi3d-cli` |
| Windows (PowerShell / cmd) | `npm i -g @hi3d/hi3d-cli` — the command is installed as `hi3d-cli.cmd`, so `hi3d-cli` works in any shell |
| No install | `npx -y @hi3d/hi3d-cli <command>` |

Verify: `hi3d-cli --version`. Upgrade: `npm i -g @hi3d/hi3d-cli@latest` (the CLI prints a one-line hint on stderr once a day when a newer version exists; `--no-update-check` disables it).

> The bare npm name `hi3d-cli` is held by an unrelated publisher; the package is `@hi3d/hi3d-cli`. The executable is `hi3d-cli` either way.
> Mirrors (e.g. npmmirror) can lag a few hours after a release: add `--registry=https://registry.npmjs.org`.

## 2. Log in and configure

| Mode | Command | Who it is for |
|---|---|---|
| **Open Platform AK/SK** | `hi3d-cli login --mode ak --ak <AK> --sk <SK>` | API users. Create keys at https://platform.hi3d.ai/console/apiKey. Pay-as-you-go, every command available. |
| **hi3d.ai account** | `hi3d-cli login --mode web --account you@example.com` | Website users. Same credits as the website. Password is prompted (hidden); or `--cookie` pastes a browser cookie. Generate / query / download / balance only. |

`hi3d-cli login` without flags asks interactively. Then check: `hi3d-cli who_am_i` (balance, catalog, and the commands unsupported in the current mode).

Profiles work like `aws configure`; config lives in `~/.hi3d/config.json` (`HI3D_CONFIG_DIR` overrides the directory):

```bash
hi3d-cli configure list                      # all profiles
hi3d-cli configure set -p work --mode ak --ak … --sk …
hi3d-cli configure profile work              # switch
hi3d-cli logout [--profile work]
HI3D_PROFILE=work hi3d-cli balance           # per-command switch
HI3D_CLIENT_ID=… HI3D_CLIENT_SECRET=… hi3d-cli balance   # CI / agents: nothing written to disk
```

## 3. Generate models

```bash
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out --name cat
hi3d-cli image_to_3d --multi-images front.png side.png --multi-images-bit 1100 --model hi3dv3.0 --resolution 2048master
hi3d-cli image_to_3d ./cat.png                    # returns task_id immediately
hi3d-cli query_task <task_id> [--poll] [--download --out ./out]   # created → queueing → processing → success | failed
hi3d-cli download_asset <task_id> --out ./out     # result URLs expire after ~1 h — download right after success
hi3d-cli split_model ./out/cat.glb --joint ball --poll --download        # 3D-print parts with connectors (ak)
hi3d-cli image_to_relief ./photo.jpg --model-type pro --format stl --poll --download   # relief (ak)
hi3d-cli multicolor_model ./out/cat.glb --number-color 4 --poll --download           # multi-color printing (ak)
hi3d-cli retexture_model ./out/cat_fixed.glb --image ./cat.png --poll --download     # textures for an edited mesh (ak, 2.0)
hi3d-cli balance
```

Generation takes 2–15 minutes. `--poll` blocks with progress on stderr; without it, poll `query_task` every ≥ 10 s.
`hi3d-cli <command> --help` lists every flag; `hi3d-cli tool_list` prints the JSON Schema of every command.

## 4. Edit with Blender (2.0)

hi3d-cli drives Blender **headless**. Nothing to configure if Blender 4.2+ is installed — it is found on PATH or in
the usual places (`/Applications/Blender.app`, `C:\Program Files\Blender Foundation\Blender *`, `/usr/bin`, snap,
flatpak) and run as `blender -b --python …`. Otherwise create a managed Python environment with the official `bpy`
wheel (~300 MB from PyPI):

```bash
hi3d-cli blender status          # which backend would be used, or what to do
hi3d-cli blender setup           # managed env: ~/.hi3d/blender/envs/bpy-5.2 (uses uv, or a matching python)
hi3d-cli blender doctor          # start, render a test cube with Cycles CPU, export a GLB
hi3d-cli blender use /path/to/blender   # pin a backend; `auto` to unpin. Or HI3D_BLENDER=app:/path | python:/path | managed
```

| bpy | Python | Wheels available |
|---|---|---|
| 5.2 LTS (default) | 3.13 | Windows x64 / arm64, Linux x86_64, macOS Apple Silicon |
| 5.0 / 4.5 LTS / 4.2 LTS | 3.11 | same |

Intel Macs and Linux aarch64 have no `bpy` wheel: install the Blender app instead (`brew install --cask blender`,
`winget install BlenderFoundation.Blender`, `snap install blender --classic`).

Typical loop (the same tools an agent calls):

```bash
hi3d-cli blender_load out/cat.glb                # faces, size (m), watertight?, textures
hi3d-cli blender_inspect                         # verify after every edit
hi3d-cli blender_scale_to_size 80                # largest dimension → 80 mm
hi3d-cli blender_repair                          # merge doubles, fill holes, normals; each step only if it does not add non-manifold edges
hi3d-cli blender_decimate --target-faces 200000
hi3d-cli blender_center --floor
hi3d-cli blender_render_preview --views iso front   # PNGs in .hi3d/renders (MCP returns them as images)
hi3d-cli blender_export out/cat_80mm.glb         # glb / gltf / obj / stl / fbx / usdz / ply / blend
hi3d-cli blender_run_script @edit.py             # any bpy code; globals bpy, bmesh, C, D, math, json; set `result` for JSON
```

- The scene persists in `<workspace>/.hi3d/session.blend`, so one-shot commands chain and an MCP restart loses nothing.
- Paths are confined to the workspace (`--workspace <dir>`, default: current directory; `--allow-any-path` disables).
- Rendering uses Cycles on CPU. Workbench / EEVEE need OpenGL: opt in with `HI3D_BLENDER_ALLOW_GL=1`.
- `blender_run_script` runs model-written Python on your machine with your privileges — the same trust level as
  letting an agent run shell commands. `hi3d-cli mcp --no-scripts` keeps only the fixed recipes; `HI3D_DISABLE_BLENDER=1` hides the whole group.

All Blender tools: `blender_status` `blender_doctor` `blender_load` `blender_inspect` `blender_run_script`
`blender_render_preview` `blender_export` `blender_session` `blender_scale_to_size` `blender_center`
`blender_transform` `blender_decimate` `blender_repair` `blender_split_loose` `blender_join` `blender_delete_objects`
`blender_apply_modifiers` `blender_hollow` `blender_setup` `blender_uninstall`.

## 5. Use with AI agents <a id="use-with-ai-agents"></a>

Two integration styles, pick what your agent supports:

- **MCP** (preferred): `hi3d-cli mcp` is a stdio MCP server; tool names = CLI commands. Add `--workspace <dir>` to confine file access.
- **Skill / shell**: the agent runs `hi3d-cli` itself. Install the skill so it knows when and how: `npx skills add mathmagical-community/hi3d-cli/skill`, or paste `hi3d-cli docs` into its context.

Generic MCP configuration (used by most clients):

```json
{ "mcpServers": { "hi3d": { "command": "hi3d-cli", "args": ["mcp", "--workspace", "/path/to/project"] } } }
```

> **Windows:** some MCP clients cannot launch `.cmd` shims. If `hi3d-cli` is "not found" inside the client, use
> `"command": "cmd", "args": ["/c", "hi3d-cli", "mcp"]`, or `"command": "npx", "args": ["-y", "@hi3d/hi3d-cli", "mcp"]`.

| Agent | How |
|---|---|
| **Claude Code** | `claude mcp add hi3d -- hi3d-cli mcp` (add `--scope user` to make it global) |
| **Codex CLI** (OpenAI) | `codex mcp add hi3d -- hi3d-cli mcp`, or in `~/.codex/config.toml`: `[mcp_servers.hi3d]` `command = "hi3d-cli"` `args = ["mcp"]`. Skills: `npx skills add mathmagical-community/hi3d-cli/skill` |
| **Cursor** | Settings → MCP → add server, or `.cursor/mcp.json` with the JSON above |
| **Trae / Doubao** (ByteDance) | Trae → AI settings → MCP → *Add manually*, paste the JSON above; Doubao-model agents built on Coze can add the same stdio server as a custom MCP plugin |
| **OpenClaw** (open-source personal agent) | Skill: copy `skill/` to `~/.openclaw/skills/hi3d-cli/` (or `npx skills add mathmagical-community/hi3d-cli/skill`); the agent calls `hi3d-cli` from its shell tool. If your OpenClaw build has an MCP client, the stdio config above works too |
| **Gemini CLI** | `gemini mcp add hi3d hi3d-cli mcp`, or `~/.gemini/settings.json` → `mcpServers` |
| **OpenCode** | `opencode.json`: `"mcp": { "hi3d": { "type": "local", "command": ["hi3d-cli", "mcp"] } }` |
| **Claude Desktop / Cline / Windsurf / Continue / any MCP client** | the generic JSON above |
| **Any shell-driven agent** | install the skill or run `hi3d-cli docs` |

Then just ask, e.g. *"Turn cat.png into a 3D model, scale it to 8 cm, fix non-manifold edges, show me a preview, export glb and re-texture it."* The agent calls `image_to_3d → blender_load → blender_inspect → blender_scale_to_size → blender_repair → blender_render_preview → blender_export → retexture_model`.

Remote mode: `hi3d-cli mcp --http 8787` serves Streamable HTTP (URLs only, no local files; `--require-auth` to require Basic AK:SK).

## 6. Output, exit codes, environment variables

Every command prints exactly one JSON document on stdout; progress and logs go to stderr.

```json
{ "ok": true,  "status": 200, "body": { "task_id": "…", "state": "success", "url": "…", "files": { "model": "out/cat.glb" } } }
{ "ok": false, "status": 400, "error": { "code": "30010000", "message": "Insufficient account balance" } }
```

Exit codes: `0` ok · `1` error · `2` bad arguments · `3` not logged in / auth · `4` not found · `5` upstream API error · `6` unsupported in this login mode.

| Variable | Purpose |
|---|---|
| `HI3D_PROFILE` | profile to use |
| `HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET` | AK/SK without a config file |
| `HI3D_WEB_COOKIE` | web session without a config file |
| `HI3D_CONFIG_DIR` | config directory (default `~/.hi3d`) |
| `HI3D_OUT_DIR` | default download directory (default `<workspace>/hi3d-out`) |
| `HI3D_WORKSPACE` | default `--workspace` |
| `HI3D_BLENDER` | pin a Blender backend: `app:/path`, `python:/path`, `managed` |
| `HI3D_BLENDER_HOME` | managed envs / cache / logs (default `~/.hi3d/blender`) |
| `HI3D_BLENDER_IDLE_MIN` | minutes before an idle Blender process exits (default 15) |
| `HI3D_BLENDER_ALLOW_GL` | allow Workbench / EEVEE rendering |
| `HI3D_DISABLE_BLENDER` | hide all Blender tools |
| `HI3D_NO_UPDATE_CHECK` | disable the update hint |

## 7. Credits

1 credit = $0.02. hi3dv3.0: 2048quality **105**, 2048master **455** · hitem3dv2.1: fast 25 / pro 45 · split / multicolor 20 · relief 10 · retexture = same as image_to_3d.
Failed generations are refunded automatically. Blender editing is free — generate once, iterate locally.

## 8. Troubleshooting

- **`hi3d-cli: command not found` right after `npm i -g`** — the npm global bin directory is not on PATH (`npm prefix -g`). On Windows open a new terminal.
- **Windows: agent says the MCP server failed to start** — see the Windows note in section 5 (`cmd /c hi3d-cli mcp`).
- **`blender status` → `ready: false`** — install Blender 4.2+ or run `hi3d-cli blender setup`; `hi3d-cli blender list` shows every candidate and why it was rejected.
- **`blender setup` cannot find Python 3.13 / 3.11** — install [uv](https://docs.astral.sh/uv/) (it downloads the right Python automatically) or pass `--python /path/to/python3.13`.
- **Render crashes with EGL / OpenGL errors** — you asked for Workbench / EEVEE; use the default Cycles or set `HI3D_BLENDER_ALLOW_GL=1` on a machine with a working GPU stack.
- **`PATH_OUTSIDE_WORKSPACE`** — use a path inside `--workspace`, or start with `--allow-any-path`.
- **Big models are slow** — `blender_decimate --target-faces 200000` first; a 2 M-face Hi3D model loads in ~8 s and decimates in ~30 s on 4 CPU cores.
- **Web-mode login says `WEB_NOT_CONFIGURED`** — see [Web mode](#web-mode) below.

### Web mode

`--mode web` drives the hi3d.ai website's own session endpoints. The site-specific constants (header ids, endpoint
paths, password scheme key, upload target) are intentionally **not** in this repository. Official npm releases have
them baked in; when building from source, provide `packages/core/src/web-constants.ts` (git-ignored; copy
`web-constants.example.ts`) or the `HI3D_WEB_CONSTANTS_JSON` environment variable. Without them the CLI works normally
in AK/SK mode.

## 9. Development and releases

```bash
npm install && npm run build
npm test                 # mock Hi3D servers + CLI / MCP e2e + Blender protocol tests (no Blender needed)
npm run test:blender     # real headless Blender e2e (skips when no backend; `hi3d-cli blender setup` first)
npm run release:pack     # esbuild single-file bundle → release/hi3d-cli-<version>.tgz
```

Layout: `packages/core` (Hi3D API clients, config), `packages/blender` (backend detection, managed env,
`python/executor.py`, session), `packages/mcp` (tool table + MCP server), `packages/cli` (commander program),
`packages/hi3d-cli` (npm package metadata), `skill/` (agent skill), `test/`, `docs/wiki/` (wiki sources).

Branches: work goes to `develop`; `main` holds released code. Releases: pre-releases are tagged `vX.Y.Z-rc.N` on `develop`
and published to npm as `next` (`npm i @hi3d/hi3d-cli@next`); stable `vX.Y.Z` tags must be on `main` and publish as
`latest`. The workflow checks the branch, runs the smoke matrix (macOS / Windows / Linux × Node 18 / 20 / 22) and
publishes to npm with provenance. Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Community

- **Questions / ideas**: [GitHub Discussions](https://github.com/mathmagical-community/hi3d-cli/discussions)
- **Bugs**: [open an issue](https://github.com/mathmagical-community/hi3d-cli/issues/new/choose) with the output of `hi3d-cli blender doctor` / `hi3d-cli status`
- **Security**: see [SECURITY.md](SECURITY.md) — please do not file public issues for vulnerabilities
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Changelog](CHANGELOG.md)
- **Docs**: [Wiki](https://github.com/mathmagical-community/hi3d-cli/wiki) (also in `docs/wiki/`)

## License

[MIT](LICENSE) © Math Magic / hi3d.ai and contributors
