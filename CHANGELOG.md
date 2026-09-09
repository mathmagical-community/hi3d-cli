# Changelog

## 1.0.0

- First release of `hi3d-cli`: single-file npm package (esbuild), Node ≥ 18, macOS / Windows / Linux.
- Login modes: Hi3D Open Platform AK/SK and hi3d.ai account (web), with `ve configure`-style profiles and env overrides.
- Commands (1:1 with MCP tools): `who_am_i`, `image_to_3d`, `query_task`, `download_asset`, `split_model`, `image_to_relief`, `multicolor_model`, `balance`, `tool_list`, `mcp`, `docs`.
- JSON output on stdout, progress on stderr, stable exit codes.
- MCP server (stdio and Streamable HTTP) and an agent skill (`skill/`).
