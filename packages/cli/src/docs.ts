/** Agent-facing reference printed by `hi3d-cli docs`; kept in sync with skill/SKILL.md. */
export const AGENT_DOCS = `# hi3d-cli — quick reference for AI agents

All commands print one JSON document to stdout: { "ok": true, "status": 200, "body": … }
or { "ok": false, "status": <http-ish>, "error": { "code", "message" } }. Progress goes to stderr.
Exit codes: 0 ok · 1 error · 2 bad arguments · 3 not logged in / auth · 4 not found · 5 upstream API error · 6 unsupported in this login mode.

## Setup (once)
  hi3d-cli login --mode ak --ak <AK> --sk <SK>          # Hi3D Open Platform keys (platform.hi3d.ai) — full feature set
  hi3d-cli login --mode web                             # hi3d.ai account (same credits as the website): browser authorization; show the user the URL printed on stderr, wait up to --timeout (300s). --no-browser: URL only. Legacy: --account <email> --password <pw>
  hi3d-cli who_am_i                                     # verify; shows balance, catalog and "unsupported" commands for this mode
Non-interactive: pass flags or set HI3D_CLIENT_ID/HI3D_CLIENT_SECRET (ak) or HI3D_WEB_COOKIE (web). Never read stdin in agents.

## Generate
  hi3d-cli image_to_3d ./cat.png --format glb --poll --download --out ./out --name cat
  hi3d-cli image_to_3d --multi-images front.png side.png --multi-images-bit 1100 --model hi3dv3.0 --resolution 2048master
  hi3d-cli query_task <task_id> [--poll] [--download --out ./out]     # states: created → queueing → processing → success | failed
  hi3d-cli download_asset <task_id> --out ./out                       # result URLs expire (~1 h); download right after success
  hi3d-cli split_model ./out/cat.glb --joint ball --poll --download   # 3D-print parts (ak only)
  hi3d-cli image_to_relief ./photo.jpg --model-type pro --format stl --poll --download   (ak only)
  hi3d-cli multicolor_model ./out/cat.glb --number-color 4 --poll --download           (ak only)
  hi3d-cli balance
  hi3d-cli tool_list                                                  # names + JSON schema of every command

## Credits (1 credit = $0.02)
  hi3dv3.0 2048quality 105 · 2048master 455 · hitem3dv2.1 fast 25 / pro 45 · split / multicolor 20 · relief 10
  Balance too low (code 30010000): ask the user to top up at https://platform.hi3d.ai — do not retry.
  Generation failed (50010001): credits are refunded automatically; retry once.

## Blender (2.0, headless; no GUI / GPU)
  hi3d-cli blender status | doctor | setup | use <path|auto> | uninstall     # installed Blender 4.2+ is auto-detected; setup = managed bpy env (~300 MB)
  hi3d-cli blender_load gen/cat.glb            # into <workspace>/.hi3d/session.blend; stats: faces, dimensions_m, non_manifold_edges, textures
  hi3d-cli blender_inspect [--detail summary]  # verify after every edit; printable = is_watertight + non_manifold_edges 0
  hi3d-cli blender_scale_to_size 80            # mm (largest dimension); blender_center --floor; blender_transform
  hi3d-cli blender_repair | blender_decimate --target-faces 200000 | blender_split_loose | blender_join | blender_hollow
  hi3d-cli blender_run_script 'code' | @file.py   # globals bpy, bmesh, C, D, math, json; set the variable result to return JSON
  hi3d-cli blender_render_preview --views iso front --resolution 512   # PNGs in .hi3d/renders; MCP returns them as images
  hi3d-cli blender_export out/cat_80mm.glb     # glb/gltf/obj/stl/fbx/usdz/ply/blend
  hi3d-cli retexture_model out/cat_80mm.glb --image ./cat.png --poll --download   # Hi3D textures for the edited mesh (v3.0)
  Paths are confined to --workspace (default cwd). Generate once (credits), then iterate in Blender for free.

## MCP (Claude Code / Cursor / Claude Desktop)
  claude mcp add hi3d -- hi3d-cli mcp
  { "mcpServers": { "hi3d": { "command": "hi3d-cli", "args": ["mcp"] } } }
Tool names are identical to the CLI commands and take the same parameters. hi3d-cli mcp --workspace <dir> [--no-scripts].
`;
