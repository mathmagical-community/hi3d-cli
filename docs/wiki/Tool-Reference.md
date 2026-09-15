# Tool / command reference

*Generated from the tool table by `node scripts/gen-wiki-tools.mjs` — do not edit by hand.*
Every MCP tool is also a CLI command with the same name; a parameter `foo_bar` is the CLI flag `--foo-bar`.
Output is always `{ ok, status, body }`; errors `{ ok:false, error:{ code, message } }`.

| Tool | Group | Read-only | Summary |
|---|---|---|---|
| [`who_am_i`](#who_am_i) | hi3d |  | Who am I / capabilities |
| [`image_to_3d`](#image_to_3d) | hi3d |  | Image to 3D |
| [`query_task`](#query_task) | hi3d |  | Query task |
| [`split_model`](#split_model) | hi3d |  | Split model for printing |
| [`image_to_relief`](#image_to_relief) | hi3d |  | Image to relief (depth map) |
| [`multicolor_model`](#multicolor_model) | hi3d |  | Multicolor model |
| [`retexture_model`](#retexture_model) | hi3d |  | Re-texture a mesh with Hi3D |
| [`balance`](#balance) | hi3d |  | Credit balance |
| [`download_asset`](#download_asset) | hi3d |  | Download asset |
| [`blender_status`](#blender_status) | blender | yes | Blender status |
| [`blender_doctor`](#blender_doctor) | blender | yes | Blender doctor |
| [`blender_load`](#blender_load) | blender |  | Load model into Blender |
| [`blender_inspect`](#blender_inspect) | blender | yes | Inspect scene |
| [`blender_run_script`](#blender_run_script) | blender |  | Run Python in Blender |
| [`blender_render_preview`](#blender_render_preview) | blender | yes | Render preview |
| [`blender_export`](#blender_export) | blender |  | Export scene |
| [`blender_session`](#blender_session) | blender |  | Session |
| [`blender_scale_to_size`](#blender_scale_to_size) | blender |  | Scale to size |
| [`blender_center`](#blender_center) | blender |  | Center on origin |
| [`blender_transform`](#blender_transform) | blender |  | Transform |
| [`blender_decimate`](#blender_decimate) | blender |  | Decimate |
| [`blender_repair`](#blender_repair) | blender |  | Repair mesh |
| [`blender_split_loose`](#blender_split_loose) | blender |  | Split loose parts |
| [`blender_join`](#blender_join) | blender |  | Join objects |
| [`blender_delete_objects`](#blender_delete_objects) | blender |  | Delete objects |
| [`blender_apply_modifiers`](#blender_apply_modifiers) | blender |  | Apply modifiers |
| [`blender_hollow`](#blender_hollow) | blender |  | Hollow (experimental) |
| [`blender_setup`](#blender_setup) | blender |  | Set up managed Blender env |
| [`blender_uninstall`](#blender_uninstall) | blender |  | Remove managed Blender env |

## who_am_i

Verify Hi3D credentials and return account balance plus the full capability catalog (models, resolutions, credits, formats, limits). Also reports the CLI version under `client`; if client.update_available is true, tell the user to run client.update_command. Call this first in a new session.

_No parameters._

## image_to_3d

Generate a 3D model from one image (or up to 4 multi-view images). Async: returns task_id; poll with query_task or set poll=true. Models: hi3dv3.0, hitem3dv2.1, hitem3dv2.0, hitem3dv1.5, scene-portraitv2.1, scene-portraitv2.0, scene-portraitv1.5 (default hi3dv3.0). hi3dv3.0 resolutions: 2048quality (105 credits) or 2048master (455 credits). Result URLs expire 1h after success, so download promptly.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `image` | `--image` | string |  | Input image (png/jpg/webp, <=20MB): a public https URL, or (local mode only) a file path. |
| `multi_images` | `--multi-images` | string[] |  | 2-4 multi-view images: a public https URL, or (local mode only) a file path. |
| `multi_images_bit` | `--multi-images-bit` | string |  | Bitmap of used multi-view slots, e.g. "1010". |
| `model` | `--model` | string |  | Model version, e.g. hi3dv3.0, hitem3dv2.1, scene-portraitv2.1. |
| `resolution` | `--resolution` | string |  | e.g. 2048quality \| 2048master (v3.0); 1536fast \| 1536pro (v2.1). |
| `request_type` | `--request-type` | `geometry` \| `texture` \| `all` |  | geometry only, texture only (needs mesh), or both (default). |
| `format` | `--format` | `glb` \| `obj` \| `stl` \| `fbx` \| `usdz` \| `3mf` |  | Output format (default obj on the API; glb recommended). |
| `face` | `--face` | integer |  | Target face count. |
| `pbr` | `--pbr` | boolean |  | Generate PBR maps (default true). |
| `shading` | `--shading` | number |  | De-shading strength 0..1 (default 0.5). |
| `mesh` | `--mesh` | string |  | Existing GLB geometry for request_type=texture: a public https URL, or (local mode only) a file path. |
| `callback_url` | `--callback-url` | string |  | Webhook POSTed on completion. |
| `poll` | `--poll` | boolean |  | Block until the task reaches success/failed (default false). |
| `poll_timeout_s` | `--poll-timeout-s` | integer |  | Max seconds to wait when polling (default 3600). |
| `download` | `--download` | boolean |  | LOCAL ONLY: after success, download model + cover to `out` (implies poll). |
| `out` | `--out` | string |  | LOCAL ONLY: directory for downloaded files. |
| `name` | `--name` | string |  | LOCAL ONLY: base file name for downloads (default task_id). |

## query_task

Get status of any Hi3D task (image_to_3d, split_, depth_, multicolor_ ids are auto-detected). States: created → queueing → processing → success | failed. On success returns url (model) and cover_url, valid ~1h.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `task_id` | `--task-id` | string | yes |  |
| `poll` | `--poll` | boolean |  | Block until the task reaches success/failed (default false). |
| `poll_timeout_s` | `--poll-timeout-s` | integer |  | Max seconds to wait when polling (default 3600). |
| `download` | `--download` | boolean |  | LOCAL ONLY: after success, download model + cover to `out` (implies poll). |
| `out` | `--out` | string |  | LOCAL ONLY: directory for downloaded files. |
| `name` | `--name` | string |  | LOCAL ONLY: base file name for downloads (default task_id). |

## split_model

Split a 3D model (glb/stl/obj, <=200MB) into printable parts with connectors. 20 credits. Async; returns task_id.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `mesh` | `--mesh` | string | yes | Input mesh: a public https URL, or (local mode only) a file path. |
| `model` | `--model` | `character` \| `general` |  | Split strategy (default character). |
| `part` | `--part` | `a` \| `b` \| `c` \| `d` \| `e` \| `f` |  | Character split template (default a). |
| `joint` | `--joint` | `none` \| `ball` \| `dovetail` \| `pin` |  | Connector type (default ball). |
| `merge` | `--merge` | boolean |  | Merge connectors into parts (default true). |
| `level` | `--level` | `low` \| `medium` \| `high` |  | Granularity for general split. |
| `format` | `--format` | `glb` \| `obj` \| `stl` \| `fbx` \| `usdz` \| `3mf` |  |  |
| `callback_url` | `--callback-url` | string |  |  |
| `poll` | `--poll` | boolean |  | Block until the task reaches success/failed (default false). |
| `poll_timeout_s` | `--poll-timeout-s` | integer |  | Max seconds to wait when polling (default 3600). |
| `download` | `--download` | boolean |  | LOCAL ONLY: after success, download model + cover to `out` (implies poll). |
| `out` | `--out` | string |  | LOCAL ONLY: directory for downloaded files. |
| `name` | `--name` | string |  | LOCAL ONLY: base file name for downloads (default task_id). |

## image_to_relief

Generate a relief / depth-map based 3D from an image. 10 credits. Formats: exr, png, stl, glb, 3mf, bmp. Async; returns task_id.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `image` | `--image` | string | yes | Input image: a public https URL, or (local mode only) a file path. |
| `model_type` | `--model-type` | `base` \| `pro` |  | base = 1K, pro = 2K (default base). |
| `format` | `--format` | `exr` \| `png` \| `stl` \| `glb` \| `3mf` \| `bmp` |  | Output format (default glb). |
| `rmbg` | `--rmbg` | boolean |  | Remove background (default true). |
| `height_relief` | `--height-relief` | number |  | Relief height (default 1.3). |
| `callback_url` | `--callback-url` | string |  |  |
| `poll` | `--poll` | boolean |  | Block until the task reaches success/failed (default false). |
| `poll_timeout_s` | `--poll-timeout-s` | integer |  | Max seconds to wait when polling (default 3600). |
| `download` | `--download` | boolean |  | LOCAL ONLY: after success, download model + cover to `out` (implies poll). |
| `out` | `--out` | string |  | LOCAL ONLY: directory for downloaded files. |
| `name` | `--name` | string |  | LOCAL ONLY: base file name for downloads (default task_id). |

## multicolor_model

Quantize a textured GLB into N colors for multi-color printing. 20 credits. Async; returns task_id.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `mesh` | `--mesh` | string | yes | Textured GLB (<=200MB): a public https URL, or (local mode only) a file path. |
| `number_color` | `--number-color` | integer |  | Number of colors 1-8, 0 = max (default 4). |
| `format` | `--format` | `obj` \| `glb` \| `fbx` \| `3mf` |  |  |
| `callback_url` | `--callback-url` | string |  |  |
| `poll` | `--poll` | boolean |  | Block until the task reaches success/failed (default false). |
| `poll_timeout_s` | `--poll-timeout-s` | integer |  | Max seconds to wait when polling (default 3600). |
| `download` | `--download` | boolean |  | LOCAL ONLY: after success, download model + cover to `out` (implies poll). |
| `out` | `--out` | string |  | LOCAL ONLY: directory for downloaded files. |
| `name` | `--name` | string |  | LOCAL ONLY: base file name for downloads (default task_id). |

## retexture_model

Generate textures for an existing/edited GLB mesh with Hi3D (request_type=texture, model hi3dv3.0; v2.x does not support it). Pass the GLB from blender_export plus the reference image(s). Same credits as image_to_3d (105 / 455). Async; returns task_id, or poll/download like image_to_3d.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `mesh` | `--mesh` | string | yes | GLB mesh (e.g. from blender_export): a public https URL, or (local mode only) a file path. |
| `image` | `--image` | string |  | Reference image: a public https URL, or (local mode only) a file path. |
| `multi_images` | `--multi-images` | string[] |  | 2-4 multi-view images: a public https URL, or (local mode only) a file path. |
| `resolution` | `--resolution` | string |  | 2048quality (default) \| 2048master |
| `pbr` | `--pbr` | boolean |  |  |
| `shading` | `--shading` | number |  |  |
| `format` | `--format` | `glb` \| `obj` \| `stl` \| `fbx` \| `usdz` \| `3mf` |  | Default glb. |
| `poll` | `--poll` | boolean |  | Block until the task reaches success/failed (default false). |
| `poll_timeout_s` | `--poll-timeout-s` | integer |  | Max seconds to wait when polling (default 3600). |
| `download` | `--download` | boolean |  | LOCAL ONLY: after success, download model + cover to `out` (implies poll). |
| `out` | `--out` | string |  | LOCAL ONLY: directory for downloaded files. |
| `name` | `--name` | string |  | LOCAL ONLY: base file name for downloads (default task_id). |

## balance

Return remaining credits (1 credit = $0.02).

_No parameters._

## download_asset

LOCAL ONLY. Download a finished task’s model + cover (or any URL) to disk. Use right after success: result URLs expire in ~1h.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `task_id` | `--task-id` | string |  |  |
| `url` | `--url` | string |  |  |
| `out` | `--out` | string |  | Directory (default ./hi3d-out). |
| `name` | `--name` | string |  |  |

## blender_status

Report which headless Blender backend is available (installed Blender app or managed bpy env), its version, the current session, and how to set one up if none is found. Call this before other blender_* tools when unsure.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `refresh` | `--refresh` | boolean |  | Re-probe candidates instead of using the cache. |
| `deep` | `--deep` | boolean |  | Also try every python on PATH (slow). |

## blender_doctor

Full diagnostic: detect all Blender candidates, start the executor, render a 64px cube with Cycles CPU, export a GLB, check the workspace is writable. Returns pass/fail per check with fix hints.

_No parameters._

## blender_load

Load a model file (glb/gltf/obj/stl/fbx/usd/usdz/ply/blend) into a fresh headless Blender scene and return its statistics (faces, dimensions in metres, manifold state, textures). Seam-split vertices are welded back on import so topology checks are meaningful.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `path` | `--path` | string | yes | Path relative to the workspace (absolute paths are rejected unless the server runs with --allow-any-path). |
| `clear` | `--clear` | boolean |  | Clear the scene first (default true). |
| `name` | `--name` | string |  | Rename the imported object. |
| `weld` | `--weld` | boolean |  | Weld duplicate vertices on import (default auto: yes unless > 1M faces). |

## blender_inspect

Statistics of the current Blender scene: per object vertices/faces/triangles, dimensions (m and mm), materials and textures, UVs, non-manifold and boundary edges, loose parts, watertight flag, volume (cm³) for closed meshes, bounds. Use after every edit to verify.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `detail` | `--detail` | `summary` \| `full` |  | summary skips the slow per-object island/volume analysis. |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_run_script

Execute Python in the persistent headless Blender session. Globals: bpy, bmesh, mathutils, C (context), D (data), math, os, json. Set a variable named `result` to return JSON. No GUI/GPU: use the data API, bmesh and object-mode operators; edit-mode operators need an active object and bpy.ops.object.mode_set. print() output is returned. Runs with the user’s privileges on their machine (same trust as a shell). Scene state persists between calls and is autosaved to .hi3d/session.blend.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `code` | `--code` | string | yes | Python source. |
| `purpose` | `--purpose` | string |  | One line describing the edit (logged). |
| `timeout_s` | `--timeout-s` | integer |  | Timeout, default 600. |

## blender_render_preview

Render the current scene with Cycles on CPU using automatic camera framing and a 3-light rig, and RETURN THE IMAGES so you can look at the model. Views: iso, front, back, left, right, top, bottom, iso_back. Keep resolution ≤ 768 and samples ≤ 64 for speed (512/32 ≈ seconds). engine workbench/eevee need OpenGL and are opt-in.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `views` | `--views` | string[] |  | Default ["iso","front"]. |
| `resolution` | `--resolution` | integer |  | Pixels, default 512. |
| `samples` | `--samples` | integer |  | Cycles samples, default 32. |
| `engine` | `--engine` | `auto` \| `cycles` \| `workbench` \| `eevee` |  |  |
| `shading` | `--shading` | `material` \| `solid` \| `wire` |  | Workbench only. |
| `transparent` | `--transparent` | boolean |  | Transparent background. |
| `name` | `--name` | string |  | Output base name under .hi3d/renders (default preview). |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_export

Export all (or selected) mesh objects to a file in the workspace: glb, gltf, obj, stl, fbx, usdz, ply, blend (by extension). Modifiers are applied. The output can be passed to retexture_model, split_model or multicolor_model.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `path` | `--path` | string | yes | Path relative to the workspace (absolute paths are rejected unless the server runs with --allow-any-path). e.g. out/model_fixed.glb |
| `format` | `--format` | `glb` \| `gltf` \| `obj` \| `stl` \| `fbx` \| `usdz` \| `ply` \| `blend` |  | Override the format implied by the extension. |
| `apply_modifiers` | `--apply-modifiers` | boolean |  |  |
| `objects` | `--objects` | string[] |  | Only these object names. |
| `draco` | `--draco` | boolean |  | Draco-compress glb (smaller, not accepted by every consumer). |

## blender_session

Inspect, save, reset or open the persistent scene (.hi3d/session.blend in the workspace). save --path / open --path write or read a separate .blend copy (autosave keeps targeting the session file); reset clears the scene.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `action` | `--action` | `info` \| `save` \| `reset` \| `open` | yes |  |
| `path` | `--path` | string |  | For save/open: a .blend path. |

## blender_scale_to_size

Uniformly scale the model so its largest (or chosen) dimension equals size_mm, then apply the transform. Hi3D outputs are ~1–2 m; use this to bring them to real print size. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `size_mm` | `--size-mm` | number |  | Target size in millimetres. |
| `size_m` | `--size-m` | number |  | Target size in metres (alternative). |
| `axis` | `--axis` | `max` \| `x` \| `y` \| `z` |  |  |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |
| `apply` | `--apply` | boolean |  |  |

## blender_center

Move the model so its bounding box is centred on X/Y and (with floor) its lowest point sits on Z=0, then apply the location. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `center` | `--center` | boolean |  |  |
| `floor` | `--floor` | boolean |  |  |
| `origin` | `--origin` | `bottom` \| `center` \| `keep` |  |  |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_transform

Translate (m), rotate (degrees, XYZ euler; objects imported in quaternion mode are switched automatically) and/or scale objects, then apply. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |
| `translate` | `--translate` | number[] |  |  |
| `rotate_deg` | `--rotate-deg` | number[] |  |  |
| `scale` | `--scale` | number \| number[] |  |  |
| `apply` | `--apply` | boolean |  |  |

## blender_decimate

Reduce face count with the Decimate modifier (collapse keeps shape and UVs; planar dissolves flat regions). Returns before/after counts. 5M → 200k faces takes ~1–2 minutes on CPU. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `target_faces` | `--target-faces` | integer |  |  |
| `ratio` | `--ratio` | number |  |  |
| `method` | `--method` | `collapse` \| `planar` |  |  |
| `symmetry` | `--symmetry` | boolean |  |  |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_repair

Make the mesh printable: merge duplicate vertices, dissolve degenerate faces, delete loose geometry, fill holes, recalculate normals. Returns non-manifold counts before/after and the list of fixes applied. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `merge_distance` | `--merge-distance` | number |  | Merge vertices closer than this (metres); default auto = 1e-5 × model size. Steps that would increase the non-manifold count are rolled back. |
| `fill_holes` | `--fill-holes` | boolean |  |  |
| `max_hole_sides` | `--max-hole-sides` | integer |  | 0 = any size. |
| `recalc_normals` | `--recalc-normals` | boolean |  |  |
| `delete_loose` | `--delete-loose` | boolean |  |  |
| `dissolve_degenerate` | `--dissolve-degenerate` | boolean |  |  |
| `triangulate` | `--triangulate` | boolean |  |  |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_split_loose

Separate disconnected pieces into individual objects, drop tiny fragments, optionally keep only the largest / top N. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `min_faces` | `--min-faces` | integer |  | Delete parts with fewer faces (default 50). |
| `keep` | `--keep` | `all` \| `largest` \| `top_n` |  |  |
| `n` | `--n` | integer |  |  |
| `rename_prefix` | `--rename-prefix` | string |  | Rename parts prefix_1, prefix_2 … |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_join

Join several mesh objects into one. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `names` | `--names` | string[] |  |  |
| `target_name` | `--target-name` | string |  | Name of the joined object. |

## blender_delete_objects

Delete mesh objects by name. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `names` | `--names` | string[] | yes |  |

## blender_apply_modifiers

Apply all modifiers on the object(s). Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_hollow

Shell the model inward with the given wall thickness to save print material. Experimental: check the result with blender_inspect / blender_repair. Returns before/after totals (faces, vertices, non-manifold edges, dimensions).

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `wall_thickness_mm` | `--wall-thickness-mm` | number |  | Wall thickness in mm (default 2). |
| `even_offset` | `--even-offset` | boolean |  | Blender even-thickness correction; default false because it can blow up organic meshes. Objects whose bounding box grows >2% are rolled back. |
| `object` | `--object` | string |  | Limit to one mesh object by name (default: all mesh objects). |

## blender_setup

Create ~/.hi3d/blender/envs/bpy-X.Y with a matching Python and `pip install bpy` (≈300 MB download from PyPI). Only needed when blender_status reports no backend; ask the user before running. Prefer an installed Blender app when available.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `bpy` | `--bpy` | string |  | bpy major.minor, e.g. 5.2 (default: newest installable). |
| `python` | `--python` | string |  | Path to a Python interpreter of the matching version (default: uv or system python). |
| `force` | `--force` | boolean |  |  |

## blender_uninstall

Delete the managed bpy environment(s) under ~/.hi3d/blender/envs.

| Parameter | CLI flag | Type | Required | Description |
|---|---|---|---|---|
| `bpy` | `--bpy` | string |  | Only this major.minor. |
