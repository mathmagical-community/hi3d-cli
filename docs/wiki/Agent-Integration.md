# Agent integration

hi3d-cli is designed to be driven by an AI agent. Two integration styles:

1. **MCP** — `hi3d-cli mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server on stdio. Tool names equal CLI command names and take the same parameters; `blender_render_preview` returns the rendered PNGs as image content so multimodal models can look at the result. Use `--workspace <dir>` to confine file access, `--no-scripts` to hide `blender_run_script`.
2. **Skill / shell** — the agent runs `hi3d-cli` commands itself. Install the skill (`skill/SKILL.md`, compatible with the Agent Skills format) so it knows when and how: `npx skills add mathmagical-community/hi3d-cli/skill`, or paste `hi3d-cli docs` into its context.

Generic MCP JSON (most clients):

```json
{
  "mcpServers": {
    "hi3d": { "command": "hi3d-cli", "args": ["mcp", "--workspace", "/path/to/project"] }
  }
}
```

Log in once with `hi3d-cli login` on the same machine (or pass `HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET` in the server's `env`).

## Windows

npm installs `hi3d-cli.cmd`. Some MCP clients spawn the command without a shell and cannot execute `.cmd` files ("ENOENT" / "server failed to start"). Use one of:

```json
{ "command": "cmd", "args": ["/c", "hi3d-cli", "mcp"] }
{ "command": "npx", "args": ["-y", "@hi3d/hi3d-cli", "mcp"] }
{ "command": "node", "args": ["C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\@hi3d\\hi3d-cli\\bin\\hi3d-cli.mjs", "mcp"] }
```

Blender itself is fully supported on Windows (installed app or `hi3d-cli blender setup` with the win x64 / arm64 `bpy` wheel).

## Per agent

### Claude Code

```bash
claude mcp add hi3d -- hi3d-cli mcp --workspace .        # project scope
claude mcp add --scope user hi3d -- hi3d-cli mcp         # every project
```

Then: *"Turn cat.png into a 3D model, scale it to 8 cm, fix non-manifold edges, show me a preview and export glb."*

### Codex CLI (OpenAI)

```bash
codex mcp add hi3d -- hi3d-cli mcp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.hi3d]
command = "hi3d-cli"
args = ["mcp"]
```

Codex also reads skills: `npx skills add mathmagical-community/hi3d-cli/skill`.

### Cursor

Settings → MCP → *Add new MCP server*, or create `.cursor/mcp.json` in the project with the generic JSON.

### Trae / Doubao (ByteDance)

Trae IDE: AI settings → MCP → *Add manually* → paste the generic JSON. Agents built on the Doubao models through Coze can register the same stdio server as a custom MCP plugin; the tool names and parameters are identical.

### OpenClaw

OpenClaw runs skills from its skills directory. Copy this repository's `skill/` folder to `~/.openclaw/skills/hi3d-cli/` (or into the workspace `skills/`), or run `npx skills add mathmagical-community/hi3d-cli/skill`; the agent then calls `hi3d-cli` through its shell tool. Builds of OpenClaw that include an MCP client can also use the generic stdio config.

### Gemini CLI

```bash
gemini mcp add hi3d hi3d-cli mcp
```

or `~/.gemini/settings.json` → `"mcpServers": { "hi3d": { "command": "hi3d-cli", "args": ["mcp"] } }`.

### OpenCode

`opencode.json`:

```json
{ "mcp": { "hi3d": { "type": "local", "command": ["hi3d-cli", "mcp"], "enabled": true } } }
```

### Claude Desktop, Cline, Windsurf, Continue, Zed, …

All accept the generic JSON in their MCP settings file.

### Remote / hosted

`hi3d-cli mcp --http 8787` serves Streamable HTTP at `http://host:8787/mcp`. Remote mode accepts URLs only (no local files, no Blender tools). `--require-auth` rejects requests without `Authorization: Basic base64(AK:SK)`; put it behind your own auth / TLS.

## What the agent does

The server instructions describe the loop: `who_am_i` → `image_to_3d` (download) → `blender_load` → `blender_inspect` → recipes or `blender_run_script` → `blender_render_preview` (look) → `blender_export` → optionally `retexture_model` / `split_model` / `multicolor_model`. Credits are spent only by Hi3D generation; Blender edits are free, so the agent is told to generate once and iterate locally.

## Example prompts

- "Generate a 3D model from `ref.png`, make it 10 cm tall and printable, export STL."
- "Load `out/robot.glb`, reduce to 200k faces keeping UVs, render iso and front previews."
- "Split `out/cat.glb` into printable parts with ball joints."
- "Re-texture `out/cat_fixed.glb` using `cat.png`."

---

# 接入 AI agent

两种接法：

1. **MCP**——`hi3d-cli mcp` 是 stdio 的 [MCP](https://modelcontextprotocol.io) server。工具名 = CLI 命令名，参数相同；`blender_render_preview` 把渲染图作为图片内容返回，多模态模型可以直接看。`--workspace <dir>` 限制文件访问，`--no-scripts` 隐藏 `blender_run_script`。
2. **Skill / shell**——agent 自己在 shell 里跑 `hi3d-cli`。装 skill（`skill/SKILL.md`，兼容 Agent Skills 格式）让它知道何时、怎么调：`npx skills add mathmagical-community/hi3d-cli/skill`，或把 `hi3d-cli docs` 的输出贴进上下文。

通用 MCP JSON 见上面英文部分。同一台机器先 `hi3d-cli login` 一次（或在 server 的 `env` 里传 `HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET`）。

## Windows

npm 装出来的是 `hi3d-cli.cmd`。有些 MCP 客户端不经 shell 直接 spawn，执行不了 `.cmd`（报 ENOENT / server failed to start）。改成 `"command": "cmd", "args": ["/c", "hi3d-cli", "mcp"]`，或 `"command": "npx", "args": ["-y", "@hi3d/hi3d-cli", "mcp"]`，或直接用 `node` 指向 `%APPDATA%\npm\node_modules\@hi3d\hi3d-cli\bin\hi3d-cli.mjs`。
Blender 在 Windows 上完全支持（已装应用，或 `hi3d-cli blender setup` 装 win x64 / arm64 的 bpy wheel）。

## 各 agent

- **Claude Code**：`claude mcp add hi3d -- hi3d-cli mcp --workspace .`；`--scope user` 全局。
- **Codex CLI**：`codex mcp add hi3d -- hi3d-cli mcp`，或 `~/.codex/config.toml` 里 `[mcp_servers.hi3d] command = "hi3d-cli" args = ["mcp"]`；skill：`npx skills add mathmagical-community/hi3d-cli/skill`。
- **Cursor**：设置 → MCP → 添加，或项目里建 `.cursor/mcp.json`。
- **Trae / 豆包**：Trae → AI 设置 → MCP → 手动添加，粘贴通用 JSON；用扣子（Coze）搭的豆包模型 agent 可把同一个 stdio server 注册为自定义 MCP 插件，工具名和参数完全一致。
- **OpenClaw（小龙虾）**：把仓库的 `skill/` 复制到 `~/.openclaw/skills/hi3d-cli/`（或工作区 `skills/`），或 `npx skills add mathmagical-community/hi3d-cli/skill`；agent 通过 shell 工具调 `hi3d-cli`。带 MCP 客户端的 OpenClaw 版本也可用通用 stdio 配置。
- **Gemini CLI**：`gemini mcp add hi3d hi3d-cli mcp`，或 `~/.gemini/settings.json` 的 `mcpServers`。
- **OpenCode**：`opencode.json` 里 `"mcp": { "hi3d": { "type": "local", "command": ["hi3d-cli", "mcp"] } }`。
- **Claude Desktop、Cline、Windsurf、Continue、Zed 等**：通用 JSON。
- **远程 / 托管**：`hi3d-cli mcp --http 8787`，只接受 URL，不含 Blender 工具；`--require-auth` 要求 Basic AK:SK，放在你自己的鉴权 / TLS 后面。

## agent 会怎么做

server 的 instructions 描述了这个循环：`who_am_i` → `image_to_3d`（下载）→ `blender_load` → `blender_inspect` → recipe 或 `blender_run_script` → `blender_render_preview`（看图）→ `blender_export` → 可选 `retexture_model` / `split_model` / `multicolor_model`。只有 Hi3D 生成扣积分，Blender 编辑免费，所以 agent 被告知"生成一次，本地迭代"。

## 示例提示词

- "用 ref.png 生成 3D 模型，做成 10 cm 高可打印，导出 STL。"
- "载入 out/robot.glb，减到 20 万面保留 UV，渲染 iso 和 front 预览。"
- "把 out/cat.glb 拆成带球形连接件的打印部件。"
- "用 cat.png 给 out/cat_fixed.glb 重新贴图。"
