# hi3d-cli 调用示例

## 单图生成并下载

```bash
hi3d-cli image_to_3d ./cat.png --model hi3dv3.0 --resolution 2048quality --format glb --poll --download --out ./out --name cat
```

```json
{
  "ok": true, "status": 200,
  "body": {
    "task_id": "…", "state": "success", "progress": 100,
    "url": "https://…/GLB0.glb?auth_key=…", "cover_url": "https://…/0.webp?auth_key=…",
    "files": { "model": "out/cat.glb", "cover": "out/cat_cover.webp" },
    "submitted": { "task_id": "…", "estimated_credits": 105 }
  }
}
```

## 提交后自行轮询（调用方有超时限制时）

```bash
hi3d-cli image_to_3d ./cat.png --format glb            # → body.task_id
hi3d-cli query_task <task_id>                          # 每 10 秒一次，直到 state 为 success / failed
hi3d-cli download_asset <task_id> --out ./out          # 成功后立刻下载
```

## 多视图

```bash
hi3d-cli image_to_3d --multi-images front.png left.png back.png right.png --multi-images-bit 1111 --format glb --poll --download
```

`--multi-images-bit` 四位分别对应 前/左/后/右，1 表示提供了该视角。

## 打印拆件（开放平台 ak 模式）

```bash
hi3d-cli split_model ./out/cat.glb --model character --joint ball --merge --format 3mf --poll --download
```

## 只用环境变量、不落盘（CI / 托管 agent）

```bash
HI3D_CLIENT_ID=… HI3D_CLIENT_SECRET=… hi3d-cli image_to_3d https://example.com/cat.png --poll
```

## 作为 MCP 使用

```bash
claude mcp add hi3d -- hi3d-cli mcp
```

MCP 工具名与命令名相同（`image_to_3d`、`query_task`……），参数与 `hi3d-cli tool_list` 输出的 inputSchema 一致。
