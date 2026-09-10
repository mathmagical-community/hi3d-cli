# Installation

## Requirements

- Node.js **18 or newer** (`node -v`). Get it from https://nodejs.org or with `nvm` / `fnm` / `volta`.
- macOS (Intel or Apple Silicon), Windows 10/11 (x64 or arm64), or Linux (x86_64 / aarch64).
- Nothing else: the package is pure JavaScript with no native modules. Blender is optional and only needed for editing (see [Blender Editing](Blender-Editing)).

## Install

```bash
npm i -g @hi3d/hi3d-cli        # global command `hi3d-cli`
hi3d-cli --version
```

Without installing: `npx -y @hi3d/hi3d-cli <command>` (e.g. `npx -y @hi3d/hi3d-cli who_am_i`).

Other package managers work the same way: `pnpm add -g @hi3d/hi3d-cli`, `yarn global add @hi3d/hi3d-cli`, `bun add -g @hi3d/hi3d-cli`.

### macOS

If `npm i -g` fails with `EACCES`, either use a Node version manager (nvm / fnm / volta) or set a user-writable prefix once:
`npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to your PATH.

### Windows

`npm i -g` creates `hi3d-cli.cmd` (and `hi3d-cli.ps1`) in `%APPDATA%\npm`, which is on PATH for PowerShell and cmd. Open a **new** terminal after installing.
For MCP clients that cannot launch `.cmd` files, see [Agent Integration → Windows](Agent-Integration#windows).

### Linux

Works with distro Node packages ≥ 18, NodeSource, nvm, or the snap. For Blender, either `snap install blender --classic`, your distro package (≥ 4.2), or `hi3d-cli blender setup` on x86_64.

## Upgrade

```bash
npm i -g @hi3d/hi3d-cli@latest
```

The CLI checks npm once a day and prints a one-line hint on stderr when a newer version exists. Disable with `--no-update-check` or `HI3D_NO_UPDATE_CHECK=1`.

## Mirrors

The scoped package is on the public npm registry. Mirrors such as npmmirror sync with a delay; if a version is missing there, install with `--registry=https://registry.npmjs.org`.

## Uninstall

```bash
npm rm -g @hi3d/hi3d-cli
hi3d-cli blender uninstall     # optional, before removing: deletes ~/.hi3d/blender/envs
rm -rf ~/.hi3d                 # config, credentials, Blender envs and caches
```

---

# 安装

## 要求

- Node.js **18 或更高**（`node -v`）。从 https://nodejs.org 下载，或用 `nvm` / `fnm` / `volta`。
- macOS（Intel 或 Apple 芯片）、Windows 10/11（x64 或 arm64）、Linux（x86_64 / aarch64）。
- 不需要别的：纯 JavaScript，没有原生模块。Blender 只有编辑功能才需要，见 [Blender Editing](Blender-Editing)。

## 安装

```bash
npm i -g @hi3d/hi3d-cli        # 全局命令 hi3d-cli
hi3d-cli --version
```

不安装直接用：`npx -y @hi3d/hi3d-cli <command>`。pnpm / yarn / bun 的全局安装同理。

### macOS

`npm i -g` 报 `EACCES` 时，用 Node 版本管理器（nvm / fnm / volta），或设置一次用户目录前缀：
`npm config set prefix ~/.npm-global`，再把 `~/.npm-global/bin` 加进 PATH。

### Windows

`npm i -g` 会在 `%APPDATA%\npm` 生成 `hi3d-cli.cmd`（和 `hi3d-cli.ps1`），PowerShell 和 cmd 都能直接用。安装后**重开**终端。
启动不了 `.cmd` 的 MCP 客户端见 [Agent Integration → Windows](Agent-Integration#windows)。

### Linux

发行版的 Node ≥ 18、NodeSource、nvm、snap 都可以。Blender 可用 `snap install blender --classic`、发行版包（≥ 4.2），或在 x86_64 上 `hi3d-cli blender setup`。

## 升级

```bash
npm i -g @hi3d/hi3d-cli@latest
```

CLI 每天检查一次 npm，有新版本在 stderr 提示一行；`--no-update-check` 或 `HI3D_NO_UPDATE_CHECK=1` 关闭。

## 镜像

包发布在 npm 官方源。淘宝等镜像同步有延迟，缺版本时加 `--registry=https://registry.npmjs.org`。

## 卸载

```bash
npm rm -g @hi3d/hi3d-cli
hi3d-cli blender uninstall     # 可选，卸载前删除 ~/.hi3d/blender/envs
rm -rf ~/.hi3d                 # 配置、凭据、Blender 环境和缓存
```
