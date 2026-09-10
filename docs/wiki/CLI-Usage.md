# CLI usage

Every command prints exactly **one JSON document** on stdout (`{ ok, status, body }` or `{ ok:false, status, error:{ code, message } }`); progress and logs go to stderr. `hi3d-cli <command> --help` lists all flags; `hi3d-cli tool_list` prints JSON Schemas; `hi3d-cli docs` prints the agent quick reference.

## Generate from an image

```bash
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out --name cat
```

- `--poll` waits for the terminal state and prints progress on stderr; `--download` saves `files.model` and `files.cover` into `--out` (default `<workspace>/hi3d-out`).
- Without `--poll` the command returns at once with `task_id` and `estimated_credits`.
- `--model hi3dv3.0` (default) or `hitem3dv2.1`; `--resolution 2048quality` (default) or `2048master`; `--format glb|obj|stl|fbx|usdz`.
- Multi-view: `--multi-images front.png side.png back.png --multi-images-bit 1110` (bits mark which of front/back/left/right are present).
- Options: `--face <n>` face count target, `--pbr`, `--shading`, `--seed`, `--request-type geometry|texture|all`.

## Poll and download later

```bash
hi3d-cli query_task <task_id>                 # state: created → queueing → processing → success | failed; progress %
hi3d-cli query_task <task_id> --poll --download --out ./out
hi3d-cli download_asset <task_id> --out ./out --name cat
```

Result URLs expire about one hour after success — download right away.

## Print-oriented commands (AK/SK only)

```bash
hi3d-cli split_model ./out/cat.glb --joint ball --poll --download        # parts with connectors; --joint ball|dovetail|pin, --split-type character|general
hi3d-cli image_to_relief ./photo.jpg --model-type pro --format stl --poll --download
hi3d-cli multicolor_model ./out/cat.glb --number-color 4 --poll --download
hi3d-cli retexture_model ./out/cat_fixed.glb --image ./cat.png --poll --download   # textures for an edited mesh (hi3dv3.0)
```

`retexture_model` needs a GLB mesh (typically from `blender_export`) and the reference image(s); it costs the same as `image_to_3d`.

## Account

```bash
hi3d-cli who_am_i      # mode, balance, catalog, unsupported commands
hi3d-cli balance
hi3d-cli status        # active profile, no network
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | ok |
| 1 | generic error |
| 2 | bad arguments (`BAD_ARGS`) |
| 3 | not logged in / auth (`NO_CREDENTIALS`, 401) |
| 4 | not found |
| 5 | upstream API error (Hi3D error codes, `POLL_TIMEOUT`, `DOWNLOAD_FAILED`) |
| 6 | unsupported in this login mode (`UNSUPPORTED_WEB`) |

## Common Hi3D error codes

| Code | Meaning | What to do |
|---|---|---|
| 30010000 | insufficient balance | top up at https://platform.hi3d.ai or https://hi3d.ai; do not retry |
| 10031001 | image larger than 20 MB | resize |
| 10031005 | unsupported image format | use png / jpg / webp |
| 50010001 | generation failed | credits are refunded; retry once |

---

# 命令行用法

每个命令在 stdout 输出且只输出**一个 JSON**（`{ ok, status, body }` 或 `{ ok:false, status, error:{ code, message } }`），进度和日志在 stderr。`hi3d-cli <command> --help` 列出全部参数；`hi3d-cli tool_list` 输出 JSON Schema；`hi3d-cli docs` 输出给 agent 的速查。

## 图生 3D

```bash
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out --name cat
```

- `--poll` 等到终态并在 stderr 打进度；`--download` 把 `files.model` 和 `files.cover` 存到 `--out`（默认 `<workspace>/hi3d-out`）。
- 不带 `--poll` 立即返回 `task_id` 和 `estimated_credits`。
- `--model hi3dv3.0`（默认）或 `hitem3dv2.1`；`--resolution 2048quality`（默认）或 `2048master`；`--format glb|obj|stl|fbx|usdz`。
- 多视图：`--multi-images front.png side.png back.png --multi-images-bit 1110`（位标记 前/后/左/右 哪几张有）。
- 其他：`--face <n>` 目标面数、`--pbr`、`--shading`、`--seed`、`--request-type geometry|texture|all`。

## 稍后查询与下载

```bash
hi3d-cli query_task <task_id>                 # 状态 created → queueing → processing → success | failed，带百分比
hi3d-cli query_task <task_id> --poll --download --out ./out
hi3d-cli download_asset <task_id> --out ./out --name cat
```

结果 URL 成功后约 1 小时过期，请尽快下载。

## 打印相关命令（仅 AK/SK）

```bash
hi3d-cli split_model ./out/cat.glb --joint ball --poll --download        # 拆件带连接件；--joint ball|dovetail|pin，--split-type character|general
hi3d-cli image_to_relief ./photo.jpg --model-type pro --format stl --poll --download
hi3d-cli multicolor_model ./out/cat.glb --number-color 4 --poll --download
hi3d-cli retexture_model ./out/cat_fixed.glb --image ./cat.png --poll --download   # 给编辑过的网格重贴图（hi3dv3.0）
```

`retexture_model` 需要 GLB 网格（通常来自 `blender_export`）加参考图，费用与 `image_to_3d` 相同。

## 账号

`hi3d-cli who_am_i`（模式、余额、目录、不支持的命令）、`hi3d-cli balance`、`hi3d-cli status`（当前 profile，不联网）。

## 退出码

0 成功 · 1 一般错误 · 2 参数错误（`BAD_ARGS`）· 3 未登录 / 鉴权（`NO_CREDENTIALS`、401）· 4 不存在 · 5 上游 API 错误（Hi3D 错误码、`POLL_TIMEOUT`、`DOWNLOAD_FAILED`）· 6 当前登录模式不支持（`UNSUPPORTED_WEB`）。

## 常见 Hi3D 错误码

30010000 余额不足（去 https://platform.hi3d.ai 或 https://hi3d.ai 充值，不要重试）· 10031001 图片超 20 MB · 10031005 图片格式不支持 · 50010001 生成失败（已退积分，可重试一次）。
