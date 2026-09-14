# Login and configuration

## Two ways to log in

| Mode | Command | Notes |
|---|---|---|
| Open Platform **AK/SK** | `hi3d-cli login --mode ak --ak <AK> --sk <SK>` | Keys from https://platform.hi3d.ai/console/apiKey (the secret is shown once). Pay-as-you-go. Every command available: generate, split, relief, multicolor, retexture. |
| **hi3d.ai account** | `hi3d-cli login --mode web` | Same credits as the website. Browser authorization: the CLI opens the site's authorization page, you approve while signed in, and the session comes back through a loopback redirect (PKCE S256, single-use code, state check); no password passes through the CLI. `--no-browser` prints the URL only and lets you paste the redirected URL (or code) back — for SSH / headless machines: open the link on your laptop, approve, then copy the `http://127.0.0.1:<port>/callback?code=…` address the browser lands on (it cannot load there) and paste it into the waiting terminal; or forward the port first (`ssh -L 8765:127.0.0.1:8765 user@server` on the laptop, `hi3d-cli login --mode web --port 8765` on the server) so the browser completes it by itself; `--port <n>` pins the callback port; `--timeout <s>` (default 300). Legacy: `--account you@example.com` (+ `--password` for scripts) or `--cookie "<cookie header>"`. Supports generate / query / download / balance only. |

`hi3d-cli login` with no flags asks which mode you want. Add `--no-verify` to skip the balance check (offline / CI).

Check the result:

```bash
hi3d-cli who_am_i
# body.authMode: ak_sk | web_session   body.balance   body.unsupported: [commands not available in this mode]
```

## Web mode: how the sign-in works

Browser authorization is the default since 2.1.0. The CLI never sees your password: it opens the site's authorization page, you approve while signed in, and the site hands the session back through a loopback redirect (PKCE S256, single-use code, state check). The session is the same 14-day cookie the website uses; the CLI renews it automatically and `hi3d-cli logout` invalidates it on the server.

| Situation | Command | What happens |
|---|---|---|
| Laptop / desktop (default) | `hi3d-cli login --mode web` | The browser opens, you approve, the terminal reports success. |
| Server, SSH, container, no browser | `hi3d-cli login --mode web --no-browser` | The link is printed. Open it on any device and approve; the browser then lands on `http://127.0.0.1:<port>/callback?code=…`, which cannot load there — copy that address from the address bar and paste it into the waiting terminal. Or forward the port first (`ssh -L 8765:127.0.0.1:8765 user@server` on your laptop, `hi3d-cli login --mode web --port 8765` on the server) and the browser completes it by itself. |
| Scripts without any browser | `hi3d-cli login --mode web --account you@example.com --password '…'` | Legacy account-password sign-in: the password goes to the site once and is not stored. |
| Reuse an existing browser session | `hi3d-cli login --mode web --cookie "<Cookie header>"` | Adopts the cookie as-is. |

`--timeout <seconds>` (default 300) bounds the wait; `--port <n>` pins the callback port. Only the session cookie is written to `~/.hi3d/config.json`.

## Profiles

Several accounts can coexist, like `aws configure` profiles:

```bash
hi3d-cli configure list                                  # all profiles and the current one
hi3d-cli configure get [name]
hi3d-cli configure set -p work --mode ak --ak … --sk …   # create / overwrite without verifying
hi3d-cli configure profile work                          # make it current
hi3d-cli configure delete old
hi3d-cli logout [--profile name]                         # web mode also ends the server-side session
HI3D_PROFILE=work hi3d-cli balance                       # one-off switch
```

## Environment variables instead of a config file

Useful for CI and agents; nothing is written to disk:

| Variable | Meaning |
|---|---|
| `HI3D_CLIENT_ID`, `HI3D_CLIENT_SECRET` | AK/SK |
| `HI3D_WEB_COOKIE` | web session cookie |
| `HI3D_PROFILE` | which stored profile to use |
| `HI3D_CONFIG_DIR` | config directory (default `~/.hi3d`) |
| `HI3D_BASE_URL` | Open API base (tests / private deployments) |

Precedence: explicit env credentials → `HI3D_PROFILE` → the current profile in the config file.

## The config file

`~/.hi3d/config.json`, mode `0600`:

```json
{
  "current": "default",
  "profiles": {
    "default": { "mode": "ak", "clientId": "…", "clientSecret": "…" },
    "me":      { "mode": "web", "account": "you@example.com", "cookie": "…", "userId": "…" }
  },
  "blender": "app:/Applications/Blender.app/Contents/MacOS/Blender"
}
```

`blender` is written by `hi3d-cli blender use …` (see [Blender Editing](Blender-Editing)). Never commit this file.

## Web mode constants

Web mode talks to the hi3d.ai website's own endpoints. Their identifiers are not in the public repository; official npm releases have them built in. Building from source without them gives `WEB_NOT_CONFIGURED` for `--mode web` while AK/SK mode keeps working — see [Development](Development#web-mode-constants).

---

# 登录与配置

## 两种登录方式

| 方式 | 命令 | 说明 |
|---|---|---|
| 开放平台 **AK/SK** | `hi3d-cli login --mode ak --ak <AK> --sk <SK>` | 密钥在 https://platform.hi3d.ai/console/apiKey 创建（secret 只显示一次）。按量计费。所有命令可用：生成、拆件、浮雕、多色、重贴图。 |
| **hi3d.ai 账号** | `hi3d-cli login --mode web` | 与网站共用积分。浏览器授权：CLI 打开站点授权页，你在已登录状态下点确认，会话经本机回调交回 CLI（PKCE S256、一次性 code、state 校验），密码不经过 CLI。`--no-browser` 只打印链接，适合 SSH / 无浏览器机器：在自己电脑的浏览器打开链接并确认，浏览器会跳到 `http://127.0.0.1:<端口>/callback?code=…`（在电脑上打不开是正常的），把地址栏这整串复制粘回等待中的终端即可；也可以先转发端口（电脑上 `ssh -L 8765:127.0.0.1:8765 user@server`，服务器上 `hi3d-cli login --mode web --port 8765`），浏览器就能自动完成；`--port <n>` 固定回调端口；`--timeout <秒>`（默认 300）。旧方式仍可用：`--account you@example.com`（脚本加 `--password`）或 `--cookie "<cookie 头>"`。只支持生成 / 查询 / 下载 / 余额。 |

不带参数的 `hi3d-cli login` 会问你选哪种。`--no-verify` 跳过余额校验（离线 / CI）。

检查：

```bash
hi3d-cli who_am_i
# body.authMode: ak_sk | web_session   body.balance   body.unsupported: [当前模式不可用的命令]
```

## web 模式：登录方式说明

2.1.0 起默认是浏览器授权登录，密码不经过 CLI：CLI 打开站点授权页，你在已登录状态下点一次确认，站点通过本机回调把会话交回 CLI（PKCE S256、一次性 code、state 校验）。会话就是网站本身的 14 天 Cookie，CLI 会自动续期，`hi3d-cli logout` 会在服务端注销。

| 场景 | 命令 | 过程 |
|---|---|---|
| 本人电脑（默认） | `hi3d-cli login --mode web` | 自动弹浏览器，确认后终端显示登录成功。 |
| 服务器、SSH、容器、没有浏览器 | `hi3d-cli login --mode web --no-browser` | 终端打印链接，在任意设备打开并确认；浏览器随后跳到 `http://127.0.0.1:<端口>/callback?code=…`，在那台设备上打不开是正常的，把地址栏这整串复制粘回等待中的终端即可。也可以先转发端口（电脑上 `ssh -L 8765:127.0.0.1:8765 user@server`，服务器上 `hi3d-cli login --mode web --port 8765`），浏览器就能自动完成。 |
| 完全没有浏览器的脚本 | `hi3d-cli login --mode web --account you@example.com --password '…'` | 旧的账号密码登录：密码只发给站点一次，不保存。 |
| 复用已有浏览器会话 | `hi3d-cli login --mode web --cookie "<Cookie 头>"` | 直接采用该 Cookie。 |

`--timeout <秒>`（默认 300）限制等待时间，`--port <n>` 固定回调端口。`~/.hi3d/config.json` 里只保存会话 Cookie。

## 多 profile

多个账号可以共存，用法同 `aws configure`：

```bash
hi3d-cli configure list                                  # 所有 profile 与当前项
hi3d-cli configure get [name]
hi3d-cli configure set -p work --mode ak --ak … --sk …   # 新建 / 覆盖，不校验
hi3d-cli configure profile work                          # 设为当前
hi3d-cli configure delete old
hi3d-cli logout [--profile name]                         # web 模式同时注销服务端会话
HI3D_PROFILE=work hi3d-cli balance                       # 单次切换
```

## 用环境变量代替配置文件

适合 CI 和 agent，不落盘：`HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET`（AK/SK）、`HI3D_WEB_COOKIE`（网站会话）、`HI3D_PROFILE`（用哪个已保存的 profile）、`HI3D_CONFIG_DIR`（配置目录，默认 `~/.hi3d`）、`HI3D_BASE_URL`（开放 API 地址，测试 / 私有部署用）。
优先级：环境变量里的凭据 → `HI3D_PROFILE` → 配置文件里的当前 profile。

## 配置文件

`~/.hi3d/config.json`，权限 `0600`，结构见上面英文部分。`blender` 字段由 `hi3d-cli blender use …` 写入。不要把这个文件提交到仓库。

## web 模式常量

web 模式调用的是 hi3d.ai 网站自己的接口，相关标识不在公开仓库里；npm 正式包已内置。从源码构建且没有这些常量时，`--mode web` 会报 `WEB_NOT_CONFIGURED`，AK/SK 模式不受影响，见 [Development](Development#web-mode-constants)。
