# Blender editing (2.0)

hi3d-cli runs Blender **headless**: no window, no GPU, works on servers and in CI. The scene lives in a persistent
Blender process bound to a workspace directory.

## Backends

| Backend | How it is found | When to use |
|---|---|---|
| **Installed Blender app** (4.2+) | `blender` on PATH; `/Applications/Blender.app`; `C:\Program Files\Blender Foundation\Blender *`; `/usr/bin`, `/usr/local/bin`, snap, flatpak | zero setup if you already have Blender; the only option on Intel Macs and Linux aarch64 |
| **Managed bpy env** | `~/.hi3d/blender/envs/bpy-X.Y`, created by `hi3d-cli blender setup` | no Blender installed; CI; Windows x64/arm64, Linux x86_64, macOS Apple Silicon |
| **Any python with bpy** | `HI3D_BLENDER=python:/path/to/python` or `hi3d-cli blender list --deep` | you manage the environment yourself |

Order of preference: explicit (`HI3D_BLENDER` env or `hi3d-cli blender use`) → installed app → managed env. Detection results are cached in `~/.hi3d/blender/detect.json` (`--refresh` re-probes).

```bash
hi3d-cli blender status [--refresh] [--deep]   # backend that would be used, candidates, hints
hi3d-cli blender list                          # every candidate with version / rejection reason
hi3d-cli blender doctor                        # start + import bpy, Cycles CPU test render, GLB export, workspace writable
hi3d-cli blender setup [--bpy 5.2] [--python /path/to/python3.13] [--force]
hi3d-cli blender use /path/to/blender | /path/to/env | auto
hi3d-cli blender uninstall [--bpy 5.2]
```

### bpy versions

| bpy | Python | Blender | Wheels |
|---|---|---|---|
| 5.2 (default, LTS) | 3.13 | 5.2 LTS | win x64 / arm64, linux x86_64, macOS arm64 |
| 5.0 | 3.11 | 5.0 | same |
| 4.5 (LTS) | 3.11 | 4.5 LTS | same |
| 4.2 (LTS) | 3.11 | 4.2 LTS | win x64, linux x86_64, macOS arm64 |

`blender setup` obtains Python in this order: `--python` → [uv](https://docs.astral.sh/uv/) (downloads the exact version) → a system interpreter of that exact minor version. It then installs the pinned `bpy` wheel from PyPI (~250–350 MB), runs a self-check and writes `env.json`.

### Nothing installed yet? (`blender status` → `ready: false`)

- **A. Install the Blender app** — macOS `brew install --cask blender`, Windows `winget install BlenderFoundation.Blender`, Linux `snap install blender --classic` / distro package ≥ 4.2. Detected automatically; the only option on Intel Mac and Linux aarch64.
- **B. uv + managed env** — `brew install uv` / `curl -LsSf https://astral.sh/uv/install.sh | sh` / `winget install astral-sh.uv`, then `hi3d-cli blender setup` (uv fetches Python 3.13, ~300 MB bpy download).
- **C. Your own Python 3.13** — `hi3d-cli blender setup --python /path/to/python3.13`. conda: `conda create -n bpy python=3.13 -y && hi3d-cli blender setup --python "$(conda run -n bpy python -c 'import sys;print(sys.executable)')"`.

A conda `(base)` or system Python of another minor version is not used automatically. Finish with `hi3d-cli blender doctor`.

## The edit loop

```bash
hi3d-cli --workspace ./proj blender_load gen/cat.glb
hi3d-cli --workspace ./proj blender_inspect
hi3d-cli --workspace ./proj blender_scale_to_size 80          # mm; --axis x|y|z|max
hi3d-cli --workspace ./proj blender_repair                     # remove doubles → dissolve degenerate → delete loose → fill holes → recalc normals
hi3d-cli --workspace ./proj blender_decimate --target-faces 200000   # or --ratio 0.1; --method collapse|planar
hi3d-cli --workspace ./proj blender_center --floor
hi3d-cli --workspace ./proj blender_render_preview --views iso front --resolution 512 --samples 32
hi3d-cli --workspace ./proj blender_export out/cat_80mm.glb
```

Every mutating tool returns `{ before, after }` totals (faces, vertices, non-manifold edges, dimensions) so you can verify without a separate inspect. `blender_repair` applies each step only if it does not increase the non-manifold edge count and reports `fixes` / `skipped`.

`blender_load` welds vertices that exporters split along UV seams (skipped above 1 M faces, `--no-weld` to disable) so manifold checks are meaningful.

Other recipes: `blender_transform` (translate m / rotate deg / scale), `blender_split_loose` (separate islands, drop fragments, keep largest / top N), `blender_join`, `blender_delete_objects`, `blender_apply_modifiers`, `blender_hollow` (experimental shell).

### Scripts

```bash
hi3d-cli blender_run_script 'for o in D.objects: o.location.z += 0.01
result = {"objects": [o.name for o in D.objects]}'
hi3d-cli blender_run_script @edit.py --timeout-s 1200
```

Globals: `bpy`, `bmesh`, `mathutils`, `C` (context), `D` (data), `math`, `os`, `json`. Assign `result` to return JSON; `print()` output is returned too. No GUI or GPU: use the data API, bmesh and object-mode operators; edit-mode operators need an active object and `bpy.ops.object.mode_set`. The script runs with **your** privileges — treat it like a shell. `hi3d-cli mcp --no-scripts` removes this tool for agents that should only use fixed recipes.

## Sessions and workspace

- State is autosaved to `<workspace>/.hi3d/session.blend` after each mutation; one-shot CLI commands chain, and an MCP server restart resumes where it stopped. `blender_session info|save|reset|open` manages it.
- The Blender process stays alive between calls and exits after `HI3D_BLENDER_IDLE_MIN` minutes (default 15).
- Renders go to `<workspace>/.hi3d/renders/<name>_<view>.png`.
- All paths are resolved inside the workspace (`--workspace <dir>`, `HI3D_WORKSPACE`, default cwd). Anything outside raises `PATH_OUTSIDE_WORKSPACE`; `--allow-any-path` disables the check.
- Logs of the Blender process: `~/.hi3d/blender/logs/executor-*.log` (last 5 kept).

## Rendering

Cycles on CPU with automatic framing and a three-light rig. Views: `iso`, `front`, `back`, `left`, `right`, `top`, `bottom`, `iso_back`. 512 px / 32 samples takes seconds; keep ≤ 768 px for previews. Workbench / EEVEE need OpenGL and can crash the process on headless machines, so they are disabled unless `HI3D_BLENDER_ALLOW_GL=1`. In MCP, the PNGs are returned as image content so the model can look at them.

## Performance (4 CPU cores, managed bpy 5.2)

| Model | load | decimate → 300 k | render 512 px × 2 | export |
|---|---|---|---|---|
| Hi3D v3.0, 2 M triangles, 2 × 8K textures | 8 s | 27 s | 2.8 s | 34 MB glb, textures kept |
| Hi3D v3.0, 5 M faces | 20 s | 79 s (→ 200 k) | 0.4 s | 25 MB |

Decimate first, then everything else is fast.

---

# 用 Blender 编辑（2.0）

hi3d-cli 以**无头方式**运行 Blender：没有窗口、不需要 GPU，服务器和 CI 上都能跑。场景保存在一个绑定到 workspace 目录的常驻 Blender 进程里。

## 后端

| 后端 | 怎么找到 | 适用 |
|---|---|---|
| **已安装的 Blender 应用**（4.2+） | PATH 上的 `blender`；`/Applications/Blender.app`；`C:\Program Files\Blender Foundation\Blender *`；`/usr/bin`、`/usr/local/bin`、snap、flatpak | 已经装了 Blender 时零配置；Intel Mac 和 Linux aarch64 的唯一选择 |
| **受管 bpy 环境** | `~/.hi3d/blender/envs/bpy-X.Y`，由 `hi3d-cli blender setup` 创建 | 没装 Blender；CI；Windows x64/arm64、Linux x86_64、macOS Apple 芯片 |
| **任意带 bpy 的 python** | `HI3D_BLENDER=python:/path/to/python` 或 `hi3d-cli blender list --deep` | 自己管理环境 |

优先级：显式指定（`HI3D_BLENDER` 或 `hi3d-cli blender use`）→ 已安装应用 → 受管环境。探测结果缓存在 `~/.hi3d/blender/detect.json`（`--refresh` 重新探测）。命令见上面英文部分。

### bpy 版本

5.2（默认，LTS）需 Python 3.13；5.0 / 4.5 / 4.2 需 Python 3.11。`blender setup` 依次尝试 `--python` → [uv](https://docs.astral.sh/uv/)（自动下载对应版本）→ 系统里同小版本的解释器，然后从 PyPI 装固定版本的 `bpy` wheel（约 250–350 MB），做自检并写 `env.json`。

### 什么都没装时（`blender status` → `ready: false`）

- **A. 安装 Blender 应用**——macOS `brew install --cask blender`，Windows `winget install BlenderFoundation.Blender`，Linux `snap install blender --classic` 或发行版包 ≥ 4.2。自动识别；Intel Mac 与 Linux aarch64 只有这一种方式。
- **B. uv + 受管环境**——`brew install uv` / `curl -LsSf https://astral.sh/uv/install.sh | sh` / `winget install astral-sh.uv`，然后 `hi3d-cli blender setup`（uv 自动下载 Python 3.13，bpy 约 300 MB）。
- **C. 自己的 Python 3.13**——`hi3d-cli blender setup --python /path/to/python3.13`。conda：`conda create -n bpy python=3.13 -y && hi3d-cli blender setup --python "$(conda run -n bpy python -c 'import sys;print(sys.executable)')"`。

其他小版本的 conda `(base)` 或系统 Python 不会被自动采用。最后 `hi3d-cli blender doctor` 验证。

## 编辑流程

命令与上面英文部分相同：`blender_load` → `blender_inspect` → `blender_scale_to_size 80`（毫米）→ `blender_repair` → `blender_decimate --target-faces 200000` → `blender_center --floor` → `blender_render_preview` → `blender_export out/x.glb`。

所有修改类工具返回 `{ before, after }` 汇总（面数、顶点数、非流形边、尺寸）。`blender_repair` 每一步只在不增加非流形边时生效，返回 `fixes` / `skipped`。`blender_load` 会把导出器按 UV 缝拆开的顶点焊回去（超过 100 万面跳过，`--no-weld` 关闭），这样流形检查才有意义。

其他 recipe：`blender_transform`、`blender_split_loose`、`blender_join`、`blender_delete_objects`、`blender_apply_modifiers`、`blender_hollow`（实验性）。

### 脚本

`hi3d-cli blender_run_script 'code'` 或 `@file.py`，`--timeout-s` 设超时。全局变量 `bpy`、`bmesh`、`mathutils`、`C`、`D`、`math`、`os`、`json`；给 `result` 赋值即返回 JSON，`print` 输出也会返回。没有 GUI / GPU：用 data API、bmesh 和 object 模式算子。脚本以**你的**权限运行，把它当 shell 看待；`hi3d-cli mcp --no-scripts` 可把这个工具从 agent 面前拿掉。

## 会话与 workspace

- 每次修改后自动保存到 `<workspace>/.hi3d/session.blend`；一次性命令自动接续，MCP server 重启也能续上。`blender_session info|save|reset|open` 管理它。
- Blender 进程在调用之间常驻，空闲 `HI3D_BLENDER_IDLE_MIN` 分钟（默认 15）后退出。
- 渲染图在 `<workspace>/.hi3d/renders/<name>_<view>.png`。
- 所有路径限制在 workspace 内（`--workspace <dir>`、`HI3D_WORKSPACE`，默认当前目录），越界报 `PATH_OUTSIDE_WORKSPACE`，`--allow-any-path` 关闭检查。
- Blender 进程日志：`~/.hi3d/blender/logs/executor-*.log`（保留最近 5 个）。

## 渲染

Cycles CPU，自动取景加三灯。视角 `iso`、`front`、`back`、`left`、`right`、`top`、`bottom`、`iso_back`。512 px / 32 samples 只要几秒，预览别超过 768 px。Workbench / EEVEE 需要 OpenGL，无头机器上可能直接崩进程，默认禁用，`HI3D_BLENDER_ALLOW_GL=1` 开启。MCP 里 PNG 会作为图片内容返回给模型看。

## 性能（4 核 CPU，受管 bpy 5.2）

200 万三角、两张 8K 贴图的 Hi3D 模型：载入 8 秒、减面到 30 万 27 秒、512 px 两视角渲染 2.8 秒、导出 34 MB 且贴图保留。500 万面模型：载入 20 秒、减到 20 万面 79 秒。先减面，后面就都快了。
