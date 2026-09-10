---
name: hi3d-cli
version: 2.0.0
description: >-
  Hi3D 官方 CLI（hi3d-cli）使用技能：图生 3D（image_to_3d）、任务查询（query_task）、结果下载（download_asset）、
  打印拆件（split_model）、浮雕（image_to_relief）、多色（multicolor_model）、余额（balance），
  以及 2.0 的无头 Blender 编辑（blender_load/inspect/repair/decimate/scale_to_size/render_preview/export/run_script）
  和重贴图（retexture_model）。命令名与 MCP 工具名 1:1，输出统一 JSON。触发词：Hi3D、hi3d、hi3d-cli、图生3D、
  image to 3D、3D 打印、glb、拆件、浮雕、多色打印、task_id、轮询、积分、登录、install、Blender、bpy、减面、修复、
  缩放尺寸、渲染预览、重贴图、retexture。
requires: node>=18
homepage: https://hi3d.ai
---

# hi3d-cli

## 安装与登录（唯一合法方式）

```bash
which hi3d-cli || npm i -g hi3d-cli        # 或临时：npx hi3d-cli <command>
hi3d-cli login --mode ak --ak <AK> --sk <SK>     # Hi3D 开放平台密钥 https://platform.hi3d.ai/console/apiKey，只显示一次
hi3d-cli login --mode web --account <email>      # 或 hi3d.ai 账号（与网站共用积分）；密码会提示输入
hi3d-cli who_am_i                                # 新会话先调：校验凭据、余额、模型/分辨率/积分目录、当前模式不支持的命令
```

- 先在对话里问用户："你是 Hi3D 开放平台的 API 用户（有 AK/SK），还是 hi3d.ai 网站用户？"再选 `--mode`，不要猜。
- 非交互 agent 必须用 `--ak/--sk`、`--account/--password`、`--cookie` 传参，或 `HI3D_CLIENT_ID/HI3D_CLIENT_SECRET`、`HI3D_WEB_COOKIE` 环境变量；**不要让 CLI 读 stdin**。
- 多 profile：`hi3d-cli configure list|get|set|delete|profile`，`HI3D_PROFILE=name` 切换。
- 凭据只能通过 `hi3d-cli login` 获取并由 CLI 保存；不要自行拼接接口、不要从浏览器抓 token。

## 唯一通道

与 Hi3D 的一切交互只通过 `hi3d-cli <command>`。所有命令输出一个 JSON：`{ ok, status, body }`；失败 `{ ok:false, error:{ code, message } }`。进度打到 stderr。
退出码：0 成功 · 1 错误 · 2 参数错误 · 3 未登录/鉴权 · 4 不存在 · 5 上游 API 错误 · 6 当前登录模式不支持。
`hi3d-cli <command> --help` 列出全部参数；`hi3d-cli tool_list` 给出每个命令的 JSON Schema。

## 常用命令

```bash
hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out --name cat
hi3d-cli image_to_3d --multi-images front.png side.png --multi-images-bit 1100 --model hi3dv3.0 --resolution 2048master
hi3d-cli query_task <task_id> --poll --download           # 状态 created→queueing→processing→success|failed
hi3d-cli download_asset <task_id> --out ./out             # 结果 URL 约 1 小时过期，成功后立刻下载
hi3d-cli split_model ./out/cat.glb --joint ball --poll --download        # 仅 ak
hi3d-cli image_to_relief ./photo.jpg --model-type pro --format stl --poll --download   # 仅 ak
hi3d-cli multicolor_model ./out/cat.glb --number-color 4 --poll --download             # 仅 ak
hi3d-cli balance
```

生成通常需要 2 到 15 分钟。用 `--poll` 阻塞等待；如果调用方有超时限制，改为先提交拿 `task_id`，再定期 `query_task`（间隔 ≥ 10 秒）。
`who_am_i.body.unsupported` 列出的命令在当前登录模式下不要调用。

## 积分（1 credit = $0.02）

| 模型 / 分辨率 | credits |
|---|---|
| hi3dv3.0 2048quality（默认） | 105 |
| hi3dv3.0 2048master | 455 |
| hitem3dv2.1 1536fast / 1536pro | 25 / 45 |
| split_model / multicolor_model | 20 |
| image_to_relief | 10 |

余额不足（code 30010000）：引导用户到 https://platform.hi3d.ai 或 https://hi3d.ai 充值，不要重试。
生成失败（50010001）：自动退积分，可重试一次。生成扣费，先和用户确认模型与分辨率再提交。

## Blender 编辑（2.0，无头，无需 GPU）

```bash
hi3d-cli blender status                    # ready:false 时：已装 Blender 4.2+ 会自动识别；否则征得同意后 hi3d-cli blender setup（下载约 300 MB）
hi3d-cli blender_load gen/cat.glb          # 载入到 <workspace>/.hi3d/session.blend，返回 faces / dimensions_m / non_manifold_edges / textures
hi3d-cli blender_inspect                   # 每次编辑后确认；可打印 = is_watertight 且 non_manifold_edges 0
hi3d-cli blender_scale_to_size 80          # 最长边 80 mm；blender_center --floor 放到原点/地面
hi3d-cli blender_repair                    # 合并重复点、补洞、法线；blender_decimate --target-faces 200000 减面
hi3d-cli blender_split_loose | blender_join | blender_delete_objects | blender_hollow --wall-thickness-mm 2
hi3d-cli blender_run_script @edit.py       # 其他任意编辑：bpy/bmesh/C/D/math/json 可用，赋值 result 返回 JSON
hi3d-cli blender_render_preview --views iso front   # 渲染图在 .hi3d/renders/；MCP 中直接以图片返回，看图判断效果
hi3d-cli blender_export out/cat_80mm.glb   # glb/obj/stl/fbx/usdz/ply
hi3d-cli retexture_model out/cat_80mm.glb --image ./cat.png --poll --download   # 编辑后的网格回 Hi3D 重贴图（v3.0，扣 105/455 积分）
```

- 路径只能在 workspace 内（默认当前目录；`--workspace <dir>` 指定）。生成扣积分，Blender 编辑免费：只生成一次，然后反复编辑。
- 顺序：load → inspect → 编辑 → inspect/render_preview 确认 → export；打印用途保持 watertight 与真实尺寸（单位米/毫米）。
- `blender_run_script` 在用户机器上执行 Python，与执行 shell 同等信任级别，只写与任务相关的编辑代码。

## 结果展示

成功后把 `body.files.model`（本地 glb/obj/stl 路径）和 `body.files.cover`（封面图）告诉用户；没有 `--download` 时给出 `body.url` 并提醒 1 小时过期。

## 保持最新

新会话首次交互时可执行一次 `hi3d-cli --version`；有新版本时 CLI 会在 stderr 提示 `npm i -g hi3d-cli@latest`。升级改动用户环境，先征得同意，且不要在生成任务进行中升级。
