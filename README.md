# hi3d-cli

Command-line client and MCP server for [Hi3D](https://hi3d.ai) image-to-3D — for terminals and for AI agents
(Claude Code, Codex, Cursor, …). Cross-platform (macOS / Windows / Linux), pure JavaScript, Node ≥ 18.
Commands map 1:1 to MCP tools; every command prints one JSON document.

**2.0** adds a headless [Blender](https://www.blender.org) backend: the same MCP server / CLI can load the generated
model, inspect it, repair / decimate / scale / split it, render previews the model can *look at*, export, and send the
edited mesh back to Hi3D for re-texturing — no Blender window, no GPU.

[中文说明](#中文说明)

```bash
npm i -g @hi3d/hi3d-cli    # or run without installing: npx @hi3d/hi3d-cli <command>
hi3d-cli login             # 1) Hi3D Open Platform AK/SK   2) hi3d.ai account
hi3d-cli who_am_i
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out
```

## Login

| Mode | Command | Notes |
|---|---|---|
| Open Platform AK/SK | `hi3d-cli login --mode ak --ak <AK> --sk <SK>` | Create keys at https://platform.hi3d.ai/console/apiKey. Pay-as-you-go, all commands. |
| hi3d.ai account | `hi3d-cli login --mode web --account you@example.com` | Same credits as the website. Password is prompted (hidden); `--cookie` pastes a browser cookie instead. Requires site constants, see [Web mode](#web-mode). |

Profiles work like `aws configure`:

```bash
hi3d-cli configure list | get [name] | set -p <name> --mode ak --ak … --sk … | delete <name> | profile <name>
hi3d-cli logout [--profile <name>]
HI3D_PROFILE=work hi3d-cli balance                       # switch by env
HI3D_CLIENT_ID=… HI3D_CLIENT_SECRET=… hi3d-cli balance   # CI / agents: inject, nothing written to disk
```

Config lives in `~/.hi3d/config.json` (override the directory with `HI3D_CONFIG_DIR`).

## Commands

```
hi3d-cli who_am_i                  verify credentials; balance, model/resolution/credit catalog, unsupported commands
hi3d-cli image_to_3d <image>       single image or --multi-images; --poll blocks until done, --download saves files
hi3d-cli query_task <task_id>      state: created → queueing → processing → success | failed; --poll, --download
hi3d-cli download_asset <task_id>  result URLs expire after ~1 h — download right after success
hi3d-cli split_model <mesh>        3D-print part splitting with connectors (ak)
hi3d-cli image_to_relief <image>   relief / depth map (ak)
hi3d-cli multicolor_model <mesh>   color quantization for multi-color printing (ak)
hi3d-cli retexture_model <mesh>    2.0: texture an existing / edited GLB with Hi3D (needs --image; hi3dv3.0)
hi3d-cli balance                   credits
hi3d-cli blender …                 2.0: status | doctor | setup | use | uninstall | list  (see below)
hi3d-cli blender_* …               2.0: load, inspect, run_script, render_preview, export, session, recipes
hi3d-cli tool_list                 JSON Schema of every command
hi3d-cli mcp                       MCP server on stdio; --http <port> for Streamable HTTP
hi3d-cli docs                      the agent-facing quick reference
```

`hi3d-cli <command> --help` lists all flags. Output shape:

```json
{ "ok": true,  "status": 200, "body": { "task_id": "…", "state": "success", "url": "…", "files": { "model": "out/cat.glb" } } }
{ "ok": false, "status": 400, "error": { "code": "30010000", "message": "Insufficient account balance" } }
```

Exit codes: `0` ok · `1` error · `2` bad arguments · `3` not logged in / auth · `4` not found · `5` upstream API error · `6` unsupported in this login mode.
Progress lines go to stderr, so stdout is always exactly one JSON document.

## Use from AI agents

**Claude Code**

```bash
claude mcp add hi3d -- hi3d-cli mcp
```

**Cursor / Claude Desktop / any MCP client**

```json
{ "mcpServers": { "hi3d": { "command": "hi3d-cli", "args": ["mcp"] } } }
```

**Codex and other shell-driven agents** — install the skill so the agent knows when and how to call the CLI:

```bash
npx skills add mathmagical-community/hi3d-cli/skill
```

or paste the output of `hi3d-cli docs` into the agent's context.

## Blender (2.0)

Nothing to configure if Blender 4.2+ is installed: `hi3d-cli` finds `blender` on PATH or in the usual places
(`/Applications/Blender.app`, `C:\Program Files\Blender Foundation\Blender *`, `/usr/bin`, snap, flatpak) and runs it
as `blender -b --python …`. Otherwise create a managed Python environment with the `bpy` wheel (~300 MB, from PyPI):

```bash
hi3d-cli blender status          # which backend would be used, or what to do
hi3d-cli blender setup           # managed env: ~/.hi3d/blender/envs/bpy-5.2 (uses uv or a matching python)
hi3d-cli blender doctor          # start, render a test cube with Cycles CPU, export a GLB
hi3d-cli blender use /path/to/blender | auto     # pin a backend (or HI3D_BLENDER=app:/path | python:/path | managed)
```

| bpy | Python | wheels |
|---|---|---|
| 5.2 LTS (default) | 3.13 | Windows x64 / arm64, Linux x86_64, macOS arm64 |
| 5.0 / 4.5 LTS / 4.2 LTS | 3.11 | same platforms |

Intel Macs and Linux aarch64 have no `bpy` wheel: install the Blender app instead (`brew install --cask blender`,
`winget install BlenderFoundation.Blender`, `snap install blender --classic`).

Editing happens in a persistent scene saved to `<workspace>/.hi3d/session.blend`, so one-shot CLI commands chain and
an MCP server restart loses nothing. All paths are confined to the workspace (`--workspace <dir>`, default cwd;
`--allow-any-path` disables). Rendering uses Cycles on CPU (EEVEE / Workbench need OpenGL; opt in with
`HI3D_BLENDER_ALLOW_GL=1`).

```bash
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out gen --name cat
hi3d-cli blender_load gen/cat.glb                # stats: faces, size (m), watertight?, textures
hi3d-cli blender_scale_to_size 80                # largest dimension → 80 mm
hi3d-cli blender_repair                          # merge doubles, fill holes, recalc normals → non_manifold 0
hi3d-cli blender_decimate --target-faces 200000
hi3d-cli blender_render_preview --views iso front   # PNGs under .hi3d/renders (MCP returns them as images)
hi3d-cli blender_export out/cat_80mm.glb
hi3d-cli retexture_model out/cat_80mm.glb --image ./cat.png --poll --download
hi3d-cli blender_run_script 'for o in D.objects: o.location.z += 0.01
result = {"objects": [o.name for o in D.objects]}'     # or @file.py; globals bpy, bmesh, C, D, math, json
```

Tools: `blender_status`, `blender_doctor`, `blender_load`, `blender_inspect`, `blender_run_script`,
`blender_render_preview`, `blender_export`, `blender_session`, `blender_scale_to_size`, `blender_center`,
`blender_transform`, `blender_decimate`, `blender_repair`, `blender_split_loose`, `blender_join`,
`blender_delete_objects`, `blender_apply_modifiers`, `blender_hollow`, `blender_setup`, `blender_uninstall`,
plus `retexture_model`. `hi3d-cli mcp --no-scripts` hides `blender_run_script`; `HI3D_DISABLE_BLENDER=1` hides the
whole group. `blender_run_script` executes model-written Python on your machine with your privileges — the same trust
level as letting an agent run shell commands; MCP clients ask before each call.

## Credits

1 credit = $0.02. hi3dv3.0: 2048quality 105, 2048master 455 · hitem3dv2.1: fast 25 / pro 45 · split / multicolor 20 · relief 10.
Failed generations are refunded automatically.

## Web mode

`--mode web` drives the hi3d.ai website's own session endpoints. The site-specific constants (header ids, endpoint
paths, password scheme key, upload target) are intentionally **not** in this repository. Provide them via
`packages/core/src/web-constants.ts` (git-ignored; copy `web-constants.example.ts`) or the `HI3D_WEB_CONSTANTS_JSON`
environment variable (at runtime, or when running `npm run release` to bake them into the bundle). Without them the CLI
works normally in AK/SK mode and reports `WEB_NOT_CONFIGURED` for web login.

> The bare npm name `hi3d-cli` is currently held by an unrelated publisher; until that is resolved the package
> is published as `@hi3d/hi3d-cli`. The executable is `hi3d-cli` either way.

## Development

```bash
npm install
npm run build            # tsc project references → packages/*/dist
npm test                 # mock Hi3D servers + end-to-end CLI / MCP checks + Blender protocol tests (no bpy needed)
npm run test:blender     # real headless Blender e2e (skips when no backend; `hi3d-cli blender setup` first)
npm run release:pack     # esbuild single-file bundle → release/hi3d-cli-<version>.tgz
node packages/cli/dist/main.js --help
```

Layout: `packages/core` (Hi3D API clients, config/profiles), `packages/blender` (backend detection, managed env,
`python/executor.py` headless Blender process, session), `packages/mcp` (tool table + MCP server),
`packages/cli` (commander program), `packages/hi3d-cli` (npm package metadata), `scripts/build-release.mjs`,
`skill/` (agent skill), `test/` (mock servers and e2e).

Releases: push a tag `v*` — GitHub Actions runs the smoke matrix (macOS / Windows / Linux × Node 18 / 20 / 22)
and publishes to npm with provenance (`NPM_TOKEN` secret required).

## License

MIT

---

## 中文说明

`hi3d-cli` 是 [Hi3D](https://hi3d.ai) 图生 3D 的命令行工具和 MCP server，给终端和 AI agent（Claude Code、Codex、Cursor 等）使用。
macOS / Windows / Linux 通用，纯 JS，Node ≥ 18。命令名与 MCP 工具名一一对应，输出统一 JSON。

```bash
npm i -g @hi3d/hi3d-cli                            # 或 npx @hi3d/hi3d-cli <command>；命令名是 hi3d-cli
hi3d-cli login --mode ak --ak <AK> --sk <SK>       # 开放平台密钥 https://platform.hi3d.ai/console/apiKey
hi3d-cli login --mode web --account you@example.com   # hi3d.ai 账号，与网站共用积分
hi3d-cli who_am_i
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out
claude mcp add hi3d -- hi3d-cli mcp                # 接入 Claude Code
```

- 多 profile：`hi3d-cli configure list|get|set|delete|profile`，`HI3D_PROFILE=name` 切换；配置在 `~/.hi3d/config.json`。
- 退出码：0 成功 · 1 错误 · 2 参数错误 · 3 未登录 · 4 不存在 · 5 上游 API 错误 · 6 当前登录模式不支持。
- web 模式依赖的站点常量不在仓库里，按上文 [Web mode](#web-mode) 通过 `web-constants.ts` 或 `HI3D_WEB_CONSTANTS_JSON` 提供。
- **2.0 Blender**：装了 Blender 4.2+ 就自动使用（`blender -b --python`），否则 `hi3d-cli blender setup` 建一个带 `bpy` 的受管 Python 环境（约 300 MB）。`hi3d-cli blender status|doctor` 检查。
  典型流程：`image_to_3d` 生成 → `blender_load` → `blender_inspect` → `blender_scale_to_size 80`（毫米）/ `blender_repair` / `blender_decimate` / `blender_run_script` → `blender_render_preview`（MCP 里把渲染图直接返回给模型看）→ `blender_export out/x.glb` → `retexture_model` 回 Hi3D 重贴图。
  场景保存在 `<workspace>/.hi3d/session.blend`，路径限制在 workspace 内（`--workspace`、`--allow-any-path`）。全程无头、CPU 渲染（Cycles），不需要 GPU。
- 开发：`npm install && npm run build && npm test`；Blender 真机测试 `npm run test:blender`；打包：`npm run release:pack`。
