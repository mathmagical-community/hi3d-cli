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

- Work on **`develop`**; open pull requests against it. `main` holds released code.
- **Nobody pushes tags.** The release workflow runs on pushes to `develop` / `main` that change `packages/hi3d-cli/package.json`, derives the tag from its `version`, checks the branch, creates the tag, the GitHub Release (tarball attached) and publishes to npm.
- **Pre-release** (test first): on `develop` set `X.Y.Z-rc.N` in `packages/hi3d-cli/package.json`, `VERSION` in `packages/cli/src/program.ts` and a `## X.Y.Z-rc.N` heading at the top of `CHANGELOG.md`; run `npm run check-version`; push. → tag `vX.Y.Z-rc.N`, GitHub pre-release, npm dist-tag `next` (`npm i @hi3d/hi3d-cli@next`).
- **Stable**: merge `develop` → `main`, set the plain `X.Y.Z` in the same three places, push `main`. → tag `vX.Y.Z`, GitHub Release, npm `latest`.
- A version that already has a tag is ignored (pushing docs to `main` never re-releases). A stable version on `develop`, or a pre-release version elsewhere, fails the run before anything is created.
- npm publishing: Trusted Publishing (register `mathmagical-community/hi3d-cli` + `release.yml` in the npm package settings) or an `NPM_TOKEN` secret. With neither, the run stays **green**, the GitHub Release still exists and the job summary prints the manual `npm publish` command.
- CI on every push / PR: `check-version`, build + tests on Linux, smoke on macOS / Windows / Linux × Node 18 / 20 / 22 (incl. the Blender protocol test), and `blender-linux` with a real bpy 5.2. `blender-app.yml` (manual) installs the Blender app on all three OSes.

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

- 在 **`develop`** 上开发，PR 提到 develop；`main` 只放已发布代码。
- **不手动打 tag。** release 工作流在 `develop` / `main` 上 `packages/hi3d-cli/package.json` 有变化的推送时运行，从 `version` 推导 tag，校验分支，自动打 tag、建 GitHub Release（附 tgz）、发 npm。
- **预发布**（先测）：在 `develop` 上把 `packages/hi3d-cli/package.json` 的 `version`、`packages/cli/src/program.ts` 的 `VERSION`、`CHANGELOG.md` 顶部标题三处改成 `X.Y.Z-rc.N`，`npm run check-version` 校验，推送 → tag `vX.Y.Z-rc.N`、GitHub 预发布、npm `next`（`npm i @hi3d/hi3d-cli@next`）。
- **正式版**：`develop` 合入 `main`，同样三处改成 `X.Y.Z`，推送 `main` → tag `vX.Y.Z`、GitHub Release、npm `latest`。
- 版本已有 tag 的推送不会重复发布（往 main 推文档不会触发）。`develop` 上出现正式版本号、或其他分支出现预发布版本号，会在创建任何东西之前失败。
- npm 发布：Trusted Publishing（在 npm 包设置里登记 `mathmagical-community/hi3d-cli` + `release.yml`）或 `NPM_TOKEN` secret。两者都没有时运行保持**绿色**，GitHub Release 照常创建，job summary 里给出手动 `npm publish` 命令。
- 每次 push / PR 的 CI：`check-version`、Linux 构建 + 测试、三系统 × Node 18 / 20 / 22 冒烟（含 Blender 协议测试）、`blender-linux` 真 bpy 5.2 e2e。`blender-app.yml`（手动）在三系统装 Blender 应用验证。

## 更新 wiki

在 PR 里改 `docs/wiki/*.md`（每页先英文后中文）。维护者同步到 GitHub wiki 的命令见上面英文部分。
