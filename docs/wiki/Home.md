# hi3d-cli Wiki

**hi3d-cli** turns images into 3D models with [Hi3D](https://hi3d.ai) and edits them with a headless Blender — from a
terminal or from any AI agent (Claude Code, Codex, Cursor, Trae / Doubao, OpenClaw, Gemini CLI, …).

| Page | What you will find |
|---|---|
| [Installation](Installation) | Node, npm / npx, per-OS notes, upgrading |
| [Login and Configuration](Login-and-Configuration) | AK/SK vs hi3d.ai account (browser authorization by default; password / cookie as fallbacks), profiles, env vars, config file |
| [CLI Usage](CLI-Usage) | generate, poll, download, split / relief / multicolor / retexture, output format, exit codes |
| [Blender Editing](Blender-Editing) | backends, `blender setup`, the edit loop, sessions, workspace confinement, performance |
| [Agent Integration](Agent-Integration) | MCP and skill setup for every supported agent, Windows notes, example prompts |
| [Tool Reference](Tool-Reference) | every tool / command with parameters (generated) |
| [FAQ](FAQ) | errors and fixes |
| [Development](Development) | repo layout, tests, branches, releasing |

Sources for these pages live in the repository under `docs/wiki/` — edit them there and open a pull request.

---

# hi3d-cli 中文 Wiki

**hi3d-cli** 用 [Hi3D](https://hi3d.ai) 把图片生成 3D 模型，并用无头 Blender 编辑——在终端里用，或接入任何 AI agent
（Claude Code、Codex、Cursor、Trae / 豆包、OpenClaw 小龙虾、Gemini CLI 等）。

| 页面 | 内容 |
|---|---|
| [Installation](Installation) | Node、npm / npx、各系统注意事项、升级 |
| [Login and Configuration](Login-and-Configuration) | AK/SK 与网站账号两种登录（网站账号默认浏览器授权，账号密码 / Cookie 为备用）、profile、环境变量、配置文件 |
| [CLI Usage](CLI-Usage) | 生成、轮询、下载、拆件 / 浮雕 / 多色 / 重贴图、输出格式、退出码 |
| [Blender Editing](Blender-Editing) | 后端、`blender setup`、编辑流程、会话、workspace 限制、性能 |
| [Agent Integration](Agent-Integration) | 各 agent 的 MCP / skill 接法、Windows 注意事项、示例提示词 |
| [Tool Reference](Tool-Reference) | 全部工具 / 命令与参数（自动生成） |
| [FAQ](FAQ) | 报错与处理 |
| [Development](Development) | 仓库结构、测试、分支、发布 |

每页在仓库里都有源文件 `docs/wiki/`，改那里然后提 PR；每页先英文后中文。
