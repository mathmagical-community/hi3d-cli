# hi3d-cli 响应字段速查

所有命令返回 `{ ok, status, body }`。字段名 snake_case。

## who_am_i

- `authenticated`：是否已登录。
- `authMode`：`ak_sk`（开放平台）或 `web_session`（hi3d.ai 账号）。
- `profile`：当前 profile 的脱敏信息（name、mode、accessKey 前后几位 / account、userId）。
- `balance`：可用积分。
- `unsupported`：当前模式不支持的命令数组（web 模式为 split_model、image_to_relief、multicolor_model）。
- `catalog`：模型、分辨率、积分、输出格式、限制（图片 ≤ 20 MB，多视图 ≤ 4 张，结果 URL 约 1 小时有效，默认并发 30）。

## image_to_3d / split_model / image_to_relief / multicolor_model

不带 `--poll` 时（提交后立即返回）：
- `task_id`：任务 id，用于 query_task。
- `state`：`created`。
- `estimated_credits`：预计扣费。

带 `--poll` 时返回终态结果（同 query_task），并附 `submitted`（提交时的信息）与 `polled: true`。

## query_task

- `task_id`、`state`：`created` | `queueing` | `processing` | `success` | `failed`。
- `progress`：百分比（web 模式有；ak 模式可能没有）。
- `url`：模型文件 URL；`cover_url`：封面 URL。二者约 1 小时后失效。
- `faces` / `vertices` / `textured` / `resolution`：web 模式返回的模型统计。
- `files`：加 `--download` 后的本地路径 `{ model, cover }`。
- `error`：失败原因（若有）。
- `raw`：上游原始返回，排障用。

## balance

- `credits`：可用积分；`usd_equivalent`：按 $0.02/credit 换算。

## 错误

`{ ok:false, status, error:{ code, message, details? } }`。常见 code：
- `NO_CREDENTIALS`：未登录 → 引导 `hi3d-cli login`。
- `BAD_ARGS`：参数错误 → 看 message 修正。
- `UNSUPPORTED_WEB`：web 模式不支持该命令 → 需要开放平台 AK/SK。
- `30010000`：余额不足。`10031001`：图片超 20 MB。`10031005`：图片格式不支持。`50010001`：生成失败已退积分。
- `POLL_TIMEOUT`：等待超时，可继续 `query_task <task_id>`。
- `401` / `login expired`：web 会话过期 → 重新 `hi3d-cli login --mode web`。
