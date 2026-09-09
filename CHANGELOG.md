# Changelog

## 1.0.1

- Uploads for web mode now use a built-in SigV4-style signed PUT; the third-party storage SDK dependency is gone (smaller bundle, no vendor code).
- Docs and comments no longer reference other vendors' CLIs.
- `npm publish` in CI is skipped when the version already exists on the registry.

## 1.0.0

- First release of `hi3d-cli`: single-file npm package (esbuild), Node ≥ 18, macOS / Windows / Linux.
- Login modes: Hi3D Open Platform AK/SK and hi3d.ai account (web), with named profiles (like `aws configure`) and env overrides.
- Commands (1:1 with MCP tools): `who_am_i`, `image_to_3d`, `query_task`, `download_asset`, `split_model`, `image_to_relief`, `multicolor_model`, `balance`, `tool_list`, `mcp`, `docs`.
- JSON output on stdout, progress on stderr, stable exit codes.
- MCP server (stdio and Streamable HTTP) and an agent skill (`skill/`).
