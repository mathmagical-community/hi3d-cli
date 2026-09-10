# hi3d-cli

<p align="center">
  <a href="https://www.npmjs.com/package/@hi3d/hi3d-cli"><img alt="npm" src="https://img.shields.io/npm/v/%40hi3d%2Fhi3d-cli?label=npm"></a>
  <a href="https://github.com/mathmagical-community/hi3d-cli/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/mathmagical-community/hi3d-cli/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="node" src="https://img.shields.io/node/v/%40hi3d%2Fhi3d-cli">
  <img alt="platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

**在终端和 AI agent 里把图片变成 3D 模型。** `hi3d-cli` 是 [Hi3D](https://hi3d.ai) 的命令行工具和 MCP server：
用图片生成可直接使用的 3D 模型，2.0 起还能用**无头 Blender** 检查、修复、减面、缩放、渲染预览、导出和重贴图——
不开 Blender 窗口，不需要 GPU。

[English](README.md) · 中文 · [Wiki](https://github.com/mathmagical-community/hi3d-cli/wiki)

- **macOS / Windows / Linux** 通用；纯 JavaScript，Node ≥ 18；`npm i -g` 或 `npx` 一键安装。
- **命令名与 MCP 工具名一一对应**，参数完全相同；每个命令输出一个 JSON。
- 面向 agent：Claude Code、Codex、Cursor、Trae / 豆包、OpenClaw（小龙虾）、Gemini CLI、OpenCode、Cline、Claude Desktop 等，见[接入 AI agent](#5-接入-ai-agent)。

```bash
npm i -g @hi3d/hi3d-cli
hi3d-cli login                                   # 开放平台 AK/SK 或 hi3d.ai 账号
hi3d-cli image_to_3d ./cat.png --poll --download  # → hi3d-out/cat.glb
hi3d-cli blender_load hi3d-out/cat.glb && hi3d-cli blender_scale_to_size 80 && hi3d-cli blender_export out/cat_80mm.glb
```

## 目录

1. [安装](#1-安装)
2. [登录与配置](#2-登录与配置)
3. [生成模型](#3-生成模型)
4. [用 Blender 编辑（2.0）](#4-用-blender-编辑20)
5. [接入 AI agent](#5-接入-ai-agent)
6. [输出格式、退出码、环境变量](#6-输出格式退出码环境变量)
7. [积分](#7-积分)
8. [常见问题](#8-常见问题)
9. [开发与发布](#9-开发与发布)

## 1. 安装

需要 [Node.js](https://nodejs.org) 18 或更高（`node -v` 查看）。

| 系统 | 命令 |
|---|---|
| macOS / Linux | `npm i -g @hi3d/hi3d-cli` |
| Windows（PowerShell / cmd） | `npm i -g @hi3d/hi3d-cli`，会装出 `hi3d-cli.cmd`，任何 shell 里直接敲 `hi3d-cli` |
| 不安装直接用 | `npx -y @hi3d/hi3d-cli <command>` |

验证：`hi3d-cli --version`。升级：`npm i -g @hi3d/hi3d-cli@latest`（有新版本时 CLI 每天在 stderr 提示一次，`--no-update-check` 关闭）。

> npm 上不带 scope 的 `hi3d-cli` 被无关的第三方占用，本项目的包名是 `@hi3d/hi3d-cli`，命令名仍是 `hi3d-cli`。
> 淘宝等镜像在发布后可能滞后几小时，可加 `--registry=https://registry.npmjs.org`。

## 2. 登录与配置

| 方式 | 命令 | 适合谁 |
|---|---|---|
| **开放平台 AK/SK** | `hi3d-cli login --mode ak --ak <AK> --sk <SK>` | API 用户。密钥在 https://platform.hi3d.ai/console/apiKey 创建。按量计费，所有命令可用。 |
| **hi3d.ai 账号** | `hi3d-cli login --mode web --account you@example.com` | 网站用户。与网站共用积分。密码提示输入不回显，也可 `--cookie` 粘贴浏览器 Cookie。只支持生成 / 查询 / 下载 / 余额。 |

不带参数的 `hi3d-cli login` 会交互式询问。登录后 `hi3d-cli who_am_i` 查看余额、模型目录和当前模式不支持的命令。

多 profile 用法与 `aws configure` 一致，配置在 `~/.hi3d/config.json`（`HI3D_CONFIG_DIR` 可改目录）：

```bash
hi3d-cli configure list                      # 所有 profile
hi3d-cli configure set -p work --mode ak --ak … --sk …
hi3d-cli configure profile work              # 切换
hi3d-cli logout [--profile work]
HI3D_PROFILE=work hi3d-cli balance           # 单次切换
HI3D_CLIENT_ID=… HI3D_CLIENT_SECRET=… hi3d-cli balance   # CI / agent：环境变量注入，不落盘
```

## 3. 生成模型

```bash
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out --name cat
hi3d-cli image_to_3d --multi-images front.png side.png --multi-images-bit 1100 --model hi3dv3.0 --resolution 2048master
hi3d-cli image_to_3d ./cat.png                    # 立即返回 task_id
hi3d-cli query_task <task_id> [--poll] [--download --out ./out]   # created → queueing → processing → success | failed
hi3d-cli download_asset <task_id> --out ./out     # 结果 URL 约 1 小时过期，成功后尽快下载
hi3d-cli split_model ./out/cat.glb --joint ball --poll --download        # 3D 打印拆件（ak）
hi3d-cli image_to_relief ./photo.jpg --model-type pro --format stl --poll --download   # 浮雕（ak）
hi3d-cli multicolor_model ./out/cat.glb --number-color 4 --poll --download           # 多色打印（ak）
hi3d-cli retexture_model ./out/cat_fixed.glb --image ./cat.png --poll --download     # 给编辑过的网格重新贴图（ak，2.0）
hi3d-cli balance
```

生成需要 2 到 15 分钟。`--poll` 阻塞等待并在 stderr 打进度；不带时每 ≥ 10 秒 `query_task` 一次。
`hi3d-cli <command> --help` 列出全部参数；`hi3d-cli tool_list` 输出每个命令的 JSON Schema。

## 4. 用 Blender 编辑（2.0）

hi3d-cli 以**无头方式**驱动 Blender。装了 Blender 4.2+ 就什么都不用配：会在 PATH 和常见位置
（`/Applications/Blender.app`、`C:\Program Files\Blender Foundation\Blender *`、`/usr/bin`、snap、flatpak）找到它，
以 `blender -b --python …` 运行。没装的话，建一个带官方 `bpy` wheel 的受管 Python 环境（从 PyPI 下载约 300 MB）：

```bash
hi3d-cli blender status          # 会用哪个后端，或者该做什么
hi3d-cli blender setup           # 受管环境：~/.hi3d/blender/envs/bpy-5.2（优先用 uv，否则找匹配版本的 python）
hi3d-cli blender doctor          # 启动、用 Cycles CPU 渲染一个测试立方体、导出 GLB
hi3d-cli blender use /path/to/blender   # 固定后端；`auto` 取消。也可 HI3D_BLENDER=app:/path | python:/path | managed
```

| bpy | Python | 有 wheel 的平台 |
|---|---|---|
| 5.2 LTS（默认） | 3.13 | Windows x64 / arm64、Linux x86_64、macOS Apple 芯片 |
| 5.0 / 4.5 LTS / 4.2 LTS | 3.11 | 同上 |

Intel Mac 和 Linux aarch64 没有 `bpy` wheel，请安装 Blender 应用（`brew install --cask blender`、
`winget install BlenderFoundation.Blender`、`snap install blender --classic`）。

典型流程（agent 调用的就是这些工具）：

```bash
hi3d-cli blender_load out/cat.glb                # 面数、尺寸（米）、是否水密、贴图
hi3d-cli blender_inspect                         # 每次编辑后确认
hi3d-cli blender_scale_to_size 80                # 最长边 → 80 mm
hi3d-cli blender_repair                          # 合并重复点、补洞、法线；每一步只在不增加非流形边时生效
hi3d-cli blender_decimate --target-faces 200000
hi3d-cli blender_center --floor
hi3d-cli blender_render_preview --views iso front   # PNG 在 .hi3d/renders（MCP 里直接以图片返回给模型看）
hi3d-cli blender_export out/cat_80mm.glb         # glb / gltf / obj / stl / fbx / usdz / ply / blend
hi3d-cli blender_run_script @edit.py             # 任意 bpy 代码；全局 bpy、bmesh、C、D、math、json；赋值 result 返回 JSON
```

- 场景保存在 `<workspace>/.hi3d/session.blend`，一次性命令之间自动接续，MCP server 重启也不丢。
- 路径限制在 workspace 内（`--workspace <dir>`，默认当前目录；`--allow-any-path` 放开）。
- 渲染用 Cycles CPU。Workbench / EEVEE 需要 OpenGL，`HI3D_BLENDER_ALLOW_GL=1` 才启用。
- `blender_run_script` 在你的机器上以你的权限执行模型写的 Python，信任级别等同让 agent 跑 shell。
  `hi3d-cli mcp --no-scripts` 只保留固定 recipe；`HI3D_DISABLE_BLENDER=1` 隐藏整组工具。

全部 Blender 工具：`blender_status` `blender_doctor` `blender_load` `blender_inspect` `blender_run_script`
`blender_render_preview` `blender_export` `blender_session` `blender_scale_to_size` `blender_center`
`blender_transform` `blender_decimate` `blender_repair` `blender_split_loose` `blender_join` `blender_delete_objects`
`blender_apply_modifiers` `blender_hollow` `blender_setup` `blender_uninstall`。

## 5. 接入 AI agent

两种接法，看你的 agent 支持哪种：

- **MCP**（推荐）：`hi3d-cli mcp` 是 stdio MCP server，工具名 = CLI 命令名。加 `--workspace <dir>` 限制文件访问范围。
- **Skill / shell**：agent 自己在 shell 里跑 `hi3d-cli`。装 skill 让它知道何时、怎么调：`npx skills add mathmagical-community/hi3d-cli/skill`，或把 `hi3d-cli docs` 的输出贴进它的上下文。

通用 MCP 配置（大多数客户端都是这个格式）：

```json
{ "mcpServers": { "hi3d": { "command": "hi3d-cli", "args": ["mcp", "--workspace", "/path/to/project"] } } }
```

> **Windows：** 有些 MCP 客户端启动不了 `.cmd` 垫片。如果客户端里报 `hi3d-cli` 找不到，改成
> `"command": "cmd", "args": ["/c", "hi3d-cli", "mcp"]`，或 `"command": "npx", "args": ["-y", "@hi3d/hi3d-cli", "mcp"]`。

| Agent | 接法 |
|---|---|
| **Claude Code** | `claude mcp add hi3d -- hi3d-cli mcp`（加 `--scope user` 全局生效） |
| **Codex CLI**（OpenAI） | `codex mcp add hi3d -- hi3d-cli mcp`，或在 `~/.codex/config.toml` 里写 `[mcp_servers.hi3d]` `command = "hi3d-cli"` `args = ["mcp"]`。Skill：`npx skills add mathmagical-community/hi3d-cli/skill` |
| **Cursor** | 设置 → MCP → 添加，或写 `.cursor/mcp.json`（上面的 JSON） |
| **Trae / 豆包**（字节） | Trae → AI 设置 → MCP → 手动添加，粘贴上面的 JSON；基于扣子（Coze）搭的豆包模型 agent 也可把这个 stdio server 作为自定义 MCP 插件加入 |
| **OpenClaw（小龙虾）** | Skill：把 `skill/` 复制到 `~/.openclaw/skills/hi3d-cli/`（或 `npx skills add mathmagical-community/hi3d-cli/skill`），agent 通过 shell 工具调用 `hi3d-cli`；你用的 OpenClaw 版本带 MCP 客户端的话，上面的 stdio 配置同样可用 |
| **Gemini CLI** | `gemini mcp add hi3d hi3d-cli mcp`，或 `~/.gemini/settings.json` → `mcpServers` |
| **OpenCode** | `opencode.json`：`"mcp": { "hi3d": { "type": "local", "command": ["hi3d-cli", "mcp"] } }` |
| **Claude Desktop / Cline / Windsurf / Continue / 任何 MCP 客户端** | 上面的通用 JSON |
| **任何能跑 shell 的 agent** | 装 skill，或 `hi3d-cli docs` |

然后直接说需求，比如"把 cat.png 生成 3D，缩到 8 cm，修好非流形，给我看预览，导出 glb 再重贴图"。agent 会依次调用
`image_to_3d → blender_load → blender_inspect → blender_scale_to_size → blender_repair → blender_render_preview → blender_export → retexture_model`。

远程模式：`hi3d-cli mcp --http 8787` 提供 Streamable HTTP（只接受 URL，不碰本地文件；`--require-auth` 要求 Basic AK:SK）。

## 6. 输出格式、退出码、环境变量

每个命令在 stdout 输出且只输出一个 JSON；进度和日志走 stderr。

```json
{ "ok": true,  "status": 200, "body": { "task_id": "…", "state": "success", "url": "…", "files": { "model": "out/cat.glb" } } }
{ "ok": false, "status": 400, "error": { "code": "30010000", "message": "Insufficient account balance" } }
```

退出码：`0` 成功 · `1` 错误 · `2` 参数错误 · `3` 未登录 / 鉴权 · `4` 不存在 · `5` 上游 API 错误 · `6` 当前登录模式不支持。

| 变量 | 作用 |
|---|---|
| `HI3D_PROFILE` | 使用哪个 profile |
| `HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET` | 不写配置文件直接用 AK/SK |
| `HI3D_WEB_COOKIE` | 不写配置文件直接用网站会话 |
| `HI3D_CONFIG_DIR` | 配置目录（默认 `~/.hi3d`） |
| `HI3D_OUT_DIR` | 默认下载目录（默认 `<workspace>/hi3d-out`） |
| `HI3D_WORKSPACE` | 默认 `--workspace` |
| `HI3D_BLENDER` | 固定 Blender 后端：`app:/path`、`python:/path`、`managed` |
| `HI3D_BLENDER_HOME` | 受管环境 / 缓存 / 日志目录（默认 `~/.hi3d/blender`） |
| `HI3D_BLENDER_IDLE_MIN` | Blender 进程空闲多少分钟退出（默认 15） |
| `HI3D_BLENDER_ALLOW_GL` | 允许 Workbench / EEVEE 渲染 |
| `HI3D_DISABLE_BLENDER` | 隐藏所有 Blender 工具 |
| `HI3D_NO_UPDATE_CHECK` | 关闭新版本提示 |

## 7. 积分

1 credit = $0.02。hi3dv3.0：2048quality **105**、2048master **455** · hitem3dv2.1：fast 25 / pro 45 · 拆件 / 多色 20 · 浮雕 10 · 重贴图与 image_to_3d 相同。
生成失败自动退积分。Blender 编辑不扣积分——生成一次，本地反复迭代。

## 8. 常见问题

- **`npm i -g` 之后 `hi3d-cli: command not found`** —— npm 全局 bin 目录不在 PATH（`npm prefix -g` 查看）。Windows 上重开一个终端。
- **Windows：agent 说 MCP server 启动失败** —— 见第 5 节的 Windows 说明（`cmd /c hi3d-cli mcp`）。
- **`blender status` 显示 `ready: false`** —— 安装 Blender 4.2+ 或 `hi3d-cli blender setup`；`hi3d-cli blender list` 列出所有候选及被拒绝的原因。
- **`blender setup` 找不到 Python 3.13 / 3.11** —— 安装 [uv](https://docs.astral.sh/uv/)（会自动下载对应 Python），或 `--python /path/to/python3.13`。
- **渲染报 EGL / OpenGL 错误** —— 你指定了 Workbench / EEVEE；用默认的 Cycles，或在有可用 GPU 驱动的机器上设 `HI3D_BLENDER_ALLOW_GL=1`。
- **`PATH_OUTSIDE_WORKSPACE`** —— 用 `--workspace` 内的路径，或加 `--allow-any-path`。
- **大模型很慢** —— 先 `blender_decimate --target-faces 200000`；200 万面的 Hi3D 模型在 4 核 CPU 上载入约 8 秒、减面约 30 秒。
- **web 模式登录提示 `WEB_NOT_CONFIGURED`** —— 见下面的 [web 模式](#web-模式)。

### web 模式

`--mode web` 走的是 hi3d.ai 网站自身的会话接口。站点相关常量（请求头标识、接口路径、密码方案密钥、上传目标）
**故意不放在仓库里**。npm 正式发布的包已内置；从源码构建时通过 `packages/core/src/web-constants.ts`（git 忽略，
复制 `web-constants.example.ts`）或环境变量 `HI3D_WEB_CONSTANTS_JSON` 提供。没有它们，AK/SK 模式一切正常。

## 9. 开发与发布

```bash
npm install && npm run build
npm test                 # mock Hi3D 服务 + CLI / MCP e2e + Blender 协议测试（不需要 Blender）
npm run test:blender     # 真实无头 Blender e2e（没有后端时跳过；先 `hi3d-cli blender setup`）
npm run release:pack     # esbuild 单文件打包 → release/hi3d-cli-<version>.tgz
```

目录：`packages/core`（Hi3D API 客户端、配置）、`packages/blender`（后端探测、受管环境、`python/executor.py`、会话）、
`packages/mcp`（工具表 + MCP server）、`packages/cli`（commander 程序）、`packages/hi3d-cli`（npm 包元数据）、
`skill/`（agent skill）、`test/`、`docs/wiki/`（wiki 源文件）。

分支：日常提交到 `develop`，`main` 只放正式发布的代码。发布：先在 `develop` 上打 `vX.Y.Z-rc.N` 出预发布版，npm 上以
`next` 标签发布（`npm i @hi3d/hi3d-cli@next` 试用）；测试没问题再合入 `main`，在 `main` 上打 `vX.Y.Z` 发正式版（`latest`）。
工作流会校验分支，跑三系统 × Node 18 / 20 / 22 冒烟，带 provenance 发布到 npm。参与贡献见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 社区

- **提问 / 想法**：[GitHub Discussions](https://github.com/mathmagical-community/hi3d-cli/discussions)
- **Bug**：[提 issue](https://github.com/mathmagical-community/hi3d-cli/issues/new/choose)，附上 `hi3d-cli blender doctor` / `hi3d-cli status` 的输出
- **安全问题**：见 [SECURITY.md](SECURITY.md)，请勿公开提 issue
- **参与贡献**：[CONTRIBUTING.md](CONTRIBUTING.md) · [行为准则](CODE_OF_CONDUCT.md) · [更新日志](CHANGELOG.md)
- **文档**：[Wiki](https://github.com/mathmagical-community/hi3d-cli/wiki)（源文件在 `docs/wiki/`）

## 许可证

[MIT](LICENSE) © Math Magic / hi3d.ai 及贡献者
