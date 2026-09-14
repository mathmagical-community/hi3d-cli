# FAQ / troubleshooting

**`hi3d-cli: command not found` after `npm i -g`** — npm's global bin directory is not on PATH. `npm prefix -g` shows it; on Windows open a new terminal.

**Is Windows supported?** — Yes: the CLI, the MCP server and Blender editing (installed Blender or the win x64 / arm64 `bpy` wheel). The only Windows caveat is MCP clients that cannot launch `.cmd` shims — see [Agent Integration → Windows](Agent-Integration#windows).

**`hi3d-cli login --mode web` on a server prints a link, and after approving the browser shows an unreachable `http://127.0.0.1:<port>/callback` page** — expected: the callback port lives on the server. Copy that full address from the browser and paste it into the waiting terminal, or forward the port first (`ssh -L 8765:127.0.0.1:8765 user@server`, then `--port 8765`). Scripts with no browser at all can still use `--account` / `--password`.

**`NO_CREDENTIALS` / exit code 3** — run `hi3d-cli login`, or set `HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET`. `hi3d-cli status` shows which profile is active.

**`UNSUPPORTED_WEB` / exit code 6** — the command needs Open Platform AK/SK (split, relief, multicolor, retexture). Log in with `--mode ak`.

**`WEB_NOT_CONFIGURED`** — you built from source without the website constants; use the npm release or see [Development](Development#web-mode-constants).

**`30010000 Insufficient account balance`** — top up; the CLI does not retry.

**`POLL_TIMEOUT`** — generation took longer than `--poll-timeout`; keep polling with `query_task <task_id>`.

**Result URL returns 403 / expired** — URLs live ~1 h. Use `--download` at generation time or `download_asset` right after success.

**`blender status` says `ready: false`** — install Blender 4.2+ or run `hi3d-cli blender setup`. `hi3d-cli blender list` explains why each candidate was rejected (too old, no bpy, not executable).

**`blender setup` fails to find Python** — install [uv](https://docs.astral.sh/uv/) (it downloads the right version) or pass `--python`. bpy 5.x needs Python 3.13, 4.x needs 3.11. On Intel Mac / Linux aarch64 there is no wheel: install the Blender app.

**`NO_BPY_WHEEL`** — same as above: no wheel for this platform; use the Blender app.

**Render aborts with `libEGL` / OpenGL errors, or the process dies** — you selected `workbench` / `eevee`. Use Cycles (default) or set `HI3D_BLENDER_ALLOW_GL=1` on a machine with a working GPU stack.

**`PATH_OUTSIDE_WORKSPACE`** — the path is outside `--workspace`; use a relative path inside it or `--allow-any-path`.

**`BLENDER_TIMEOUT`** — the operation exceeded its timeout; decimate first, or raise `--timeout-s` on `blender_run_script`.

**`BLENDER_OP_FAILED`** — a Python exception inside Blender; the message and traceback are in `error.details`. Logs: `~/.hi3d/blender/logs/`.

**The agent keeps regenerating instead of editing** — remind it that generation costs credits and Blender edits are free; the server instructions already say so. Check `who_am_i.balance`.

**How do I completely reset?** — `hi3d-cli blender_session reset` (scene), delete `<workspace>/.hi3d/` (session + renders), `hi3d-cli blender uninstall` (managed env), `rm -rf ~/.hi3d` (everything incl. credentials).

---

# 常见问题

**`npm i -g` 后 `hi3d-cli: command not found`**——npm 全局 bin 目录不在 PATH，`npm prefix -g` 查看；Windows 重开终端。

**支持 Windows 吗？**——支持：CLI、MCP server、Blender 编辑（已装 Blender 或 win x64 / arm64 的 `bpy` wheel）都可用。唯一要注意的是有些 MCP 客户端启动不了 `.cmd`，见 [Agent Integration → Windows](Agent-Integration#windows)。

**服务器上 `hi3d-cli login --mode web` 打印了链接，浏览器确认后跳到打不开的 `http://127.0.0.1:<端口>/callback`**——正常现象，回调端口在服务器上。把浏览器地址栏这整串复制粘回等待中的终端即可；或先转发端口（`ssh -L 8765:127.0.0.1:8765 user@server`，再加 `--port 8765`）。完全没有浏览器的脚本仍可用 `--account` / `--password`。

**`NO_CREDENTIALS` / 退出码 3**——`hi3d-cli login`，或设 `HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET`。`hi3d-cli status` 看当前 profile。

**`UNSUPPORTED_WEB` / 退出码 6**——该命令需要开放平台 AK/SK（拆件、浮雕、多色、重贴图）。用 `--mode ak` 登录。

**`WEB_NOT_CONFIGURED`**——从源码构建时没有站点常量；用 npm 发布版，或见 [Development](Development#web-mode-constants)。

**`30010000` 余额不足**——充值；CLI 不会重试。

**`POLL_TIMEOUT`**——超过 `--poll-timeout`；继续 `query_task <task_id>`。

**结果 URL 403 / 过期**——URL 约 1 小时有效。生成时带 `--download`，或成功后马上 `download_asset`。

**`blender status` 显示 `ready: false`**——装 Blender 4.2+ 或 `hi3d-cli blender setup`。`hi3d-cli blender list` 说明每个候选被拒的原因。

**`blender setup` 找不到 Python**——装 [uv](https://docs.astral.sh/uv/)（自动下载对应版本）或传 `--python`。bpy 5.x 需 Python 3.13，4.x 需 3.11。Intel Mac / Linux aarch64 没有 wheel，装 Blender 应用。

**`NO_BPY_WHEEL`**——同上，该平台没有 wheel，用 Blender 应用。

**渲染报 `libEGL` / OpenGL 错误或进程退出**——选了 `workbench` / `eevee`。用默认 Cycles，或在 GPU 驱动正常的机器上设 `HI3D_BLENDER_ALLOW_GL=1`。

**`PATH_OUTSIDE_WORKSPACE`**——路径在 `--workspace` 之外；用内部相对路径或 `--allow-any-path`。

**`BLENDER_TIMEOUT`**——操作超时；先减面，或给 `blender_run_script` 加大 `--timeout-s`。

**`BLENDER_OP_FAILED`**——Blender 内的 Python 异常，信息和 traceback 在 `error.details`；日志在 `~/.hi3d/blender/logs/`。

**agent 一直重新生成而不是编辑**——提醒它生成扣积分、Blender 编辑免费（server instructions 里已写）。看 `who_am_i.balance`。

**怎么彻底重置？**——`hi3d-cli blender_session reset`（场景）、删 `<workspace>/.hi3d/`（会话 + 渲染图）、`hi3d-cli blender uninstall`（受管环境）、`rm -rf ~/.hi3d`（全部含凭据）。
