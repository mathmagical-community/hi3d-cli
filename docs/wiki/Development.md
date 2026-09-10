# Development

```bash
git clone https://github.com/mathmagical-community/hi3d-cli.git && cd hi3d-cli
npm install
npm run build            # tsc project references → packages/*/dist
npm test                 # mock Hi3D servers + CLI / MCP e2e + Blender protocol & detection tests (no Blender needed)
npm run test:blender     # real headless Blender e2e (skips when no backend; REQUIRE_BLENDER=1 to fail instead)
npm run release:pack     # single-file bundle → release/hi3d-cli/ and release/*.tgz
npm run docs:wiki        # regenerate docs/wiki/Tool-Reference.md from the tool table
node packages/cli/dist/main.js --help
```

## Repository layout

| Path | Contents |
|---|---|
| `packages/core` | Hi3D Open API client, website-session client, config / profiles, shared operations (`ops.ts`) |
| `packages/blender` | backend detection (`detect.ts`), managed env (`managed-env.ts`), process driver (`executor.ts`), session (`session.ts`), high-level ops (`ops.ts`), `python/executor.py` |
| `packages/mcp` | tool table (`tools.ts`, `blender-tools.ts`), MCP server (`server.ts`), stdio / HTTP entry (`main.ts`) |
| `packages/cli` | commander program generated from the tool table, `login` / `configure` / `blender` commands, `docs` |
| `packages/hi3d-cli` | npm package metadata and README shipped to npm |
| `scripts/` | `build-release.mjs` (esbuild bundle + `python/` copy), `ensure-constants.mjs`, `gen-wiki-tools.mjs` |
| `skill/` | agent skill (SKILL.md, reference, examples) |
| `test/` | mock servers, e2e scripts, protocol test, fake Blender app |
| `docs/wiki/` | sources of the GitHub wiki |

Design rules: CLI commands and MCP tools are the same table (add a `ToolDef`, get both); stdout is one JSON document; no native dependencies; no site-specific constants in git.

## How the Blender integration works

`python/executor.py` is started either as `blender -b --factory-startup --python executor.py -- --channel stdio` (installed app) or `python -u executor.py --channel stdio` (bpy env). On start it `dup2`s stdout onto stderr so Blender's own prints cannot corrupt the protocol, and writes JSON responses prefixed with `HI3D:` to the original stdout. Requests are JSON lines `{ "id", "op", "args" }`. Node's `BlenderExecutor` parses replies, applies per-call timeouts and tails logs; `BlenderSession` adds workspace confinement, the `session.blend` autosave and idle shutdown.

Tests without Blender: `test/blender-protocol.mjs` runs the executor with a bpy-less Python (handshake, ping, clean errors) and detects a fake `blender` executable (`test/fake-blender/`, works on Windows too) to verify version parsing and launch arguments.

## Web mode constants

`packages/core/src/web-constants.ts` is git-ignored; `npm run build` copies `web-constants.example.ts` when it is missing so builds always succeed. Real values are injected at release time via the `HI3D_WEB_CONSTANTS_JSON` environment variable (`scripts/build-release.mjs` bakes them into the bundle). Do not commit them.

## Branches and releases

- Work on **`develop`**; open pull requests against it.
- **Pre-release** (test first): on `develop` set `version` in `packages/hi3d-cli/package.json` and `VERSION` in `packages/cli/src/program.ts` to `X.Y.Z-rc.N`, tag `vX.Y.Z-rc.N`. The workflow publishes it to npm under the dist-tag `next` (`npm i @hi3d/hi3d-cli@next`) and marks the GitHub Release as pre-release.
- **Stable**: merge `develop` → `main`, set the plain version `X.Y.Z`, update `CHANGELOG.md`, tag `vX.Y.Z` on `main` → npm `latest`.
- `release.yml` checks that the tag matches the package version, that stable tags are on `main` (pre-release tags on `develop` or `main`), runs tests, creates the GitHub Release with the packed tarball and publishes to npm with provenance (npm Trusted Publishing; the package name comes from the repository variable `NPM_PACKAGE_NAME`, default `@hi3d/hi3d-cli`).
- CI on every push / PR: build + tests on Linux, smoke on macOS / Windows / Linux × Node 18 / 20 / 22 (including the Blender protocol test), and `blender-linux` which installs bpy 5.2 and runs the real Blender e2e. `blender-app.yml` (manual) installs the Blender app on all three OSes.

## Updating the wiki

Edit `docs/wiki/*.md` in a pull request (each page: English first, then 中文). Maintainers sync the folder to the GitHub wiki:

```bash
git clone git@github.com:mathmagical-community/hi3d-cli.wiki.git /tmp/wiki
cp docs/wiki/*.md /tmp/wiki/ && cd /tmp/wiki && git add -A && git commit -m "sync from docs/wiki" && git push
```

---

# 开发

命令见上面英文部分：`npm install && npm run build && npm test`，`npm run test:blender` 跑真实 Blender e2e，`npm run release:pack` 打包，`npm run docs:wiki` 重新生成工具参考。

## 仓库结构

`packages/core`（Hi3D API 客户端、网站会话客户端、配置、共享操作）、`packages/blender`（探测、受管环境、进程驱动、会话、`python/executor.py`）、`packages/mcp`（工具表、MCP server）、`packages/cli`（由工具表生成的命令、login / configure / blender 命令）、`packages/hi3d-cli`（npm 包元数据）、`scripts/`、`skill/`、`test/`、`docs/wiki/`。

设计规则：CLI 命令和 MCP 工具是同一张表（加一个 `ToolDef` 两边都有）；stdout 只输出一个 JSON；没有原生依赖；站点常量不进 git。

## Blender 集成原理

`python/executor.py` 由 `blender -b --factory-startup --python executor.py -- --channel stdio`（已装应用）或 `python -u executor.py --channel stdio`（bpy 环境）启动。启动时把 stdout `dup2` 到 stderr，Blender 自己的打印就污染不了协议；JSON 响应以 `HI3D:` 前缀写到原 stdout。请求是 JSON 行 `{ "id", "op", "args" }`。Node 侧 `BlenderExecutor` 解析响应、按调用设超时、写日志；`BlenderSession` 负责 workspace 限制、`session.blend` 自动保存和空闲退出。

不需要 Blender 的测试：`test/blender-protocol.mjs` 用没有 bpy 的 Python 跑执行器（握手、ping、错误处理），并探测一个假的 `blender` 可执行文件（`test/fake-blender/`，Windows 也能跑）验证版本解析和启动参数。

## web 模式常量

`packages/core/src/web-constants.ts` 被 git 忽略；缺失时 `npm run build` 自动复制 `web-constants.example.ts`，构建总能通过。真实值在发布时通过环境变量 `HI3D_WEB_CONSTANTS_JSON` 注入 bundle。不要提交它们。

## 分支与发布

- 在 **`develop`** 上开发，PR 也提到 develop。
- **预发布**（先测）：在 `develop` 上把 `packages/hi3d-cli/package.json` 的 `version` 和 `packages/cli/src/program.ts` 的 `VERSION` 改成 `X.Y.Z-rc.N`，打 `vX.Y.Z-rc.N` tag。工作流以 npm `next` 标签发布（`npm i @hi3d/hi3d-cli@next`），GitHub Release 标为 pre-release。
- **正式版**：`develop` 合入 `main`，改成 `X.Y.Z`，更新 `CHANGELOG.md`，在 `main` 上打 `vX.Y.Z` → npm `latest`。
- `release.yml` 校验 tag 与包版本一致、正式 tag 必须在 `main`（预发布 tag 在 `develop` 或 `main`），跑测试，建 GitHub Release（带 tgz），带 provenance 发布到 npm（npm Trusted Publishing；包名来自仓库变量 `NPM_PACKAGE_NAME`，默认 `@hi3d/hi3d-cli`）。
- 每次 push / PR 的 CI：Linux 构建 + 测试，三系统 × Node 18 / 20 / 22 冒烟（含 Blender 协议测试），`blender-linux` 装 bpy 5.2 跑真实 e2e。`blender-app.yml`（手动）在三系统装 Blender 应用验证。

## 更新 wiki

在 PR 里改 `docs/wiki/*.md`（每页先英文后中文）。维护者同步到 GitHub wiki 的命令见上面英文部分。
