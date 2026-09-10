#!/usr/bin/env bash
# Blender (2.0) end-to-end: needs a real backend (installed Blender or `hi3d-cli blender setup`).
# Run: npm run test:blender   — exits 0 with a SKIP note when no backend is available unless REQUIRE_BLENDER=1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TMP="$(mktemp -d)"
cleanup() { pkill -f "^node test/mock-" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
H="node packages/cli/dist/main.js"
j() { python3 -c "import json,sys;d=json.load(sys.stdin);exec(sys.argv[1])" "$1"; }
export HI3D_NO_UPDATE_CHECK=1 HI3D_BLENDER_HOME="${HI3D_BLENDER_HOME:-${HI3D_CONFIG_DIR:-$HOME/.hi3d}/blender}" HI3D_CONFIG_DIR="$TMP/home"

if ! $H blender status | j "import sys; sys.exit(0 if d['body']['ready'] else 1)"; then
  $H blender status | j "print(d['body']['setup_hint'])"
  if [[ "${REQUIRE_BLENDER:-}" == "1" ]]; then echo "no Blender backend"; exit 1; fi
  echo "SKIP: no Blender backend (install Blender or run: hi3d-cli blender setup)"; exit 0
fi

echo "## blender doctor"
$H blender doctor 2>/dev/null | j "assert d['ok'] and d['body']['ok'], d; print('doctor ok:', [c['name'] for c in d['body']['checks']])"

echo "## CLI one-shot chain (session.blend persistence)"
WS="$TMP/ws"; mkdir -p "$WS"
$H --workspace "$WS" blender_run_script 'bpy.ops.mesh.primitive_cube_add(size=2)' 2>/dev/null | j "assert d['ok']; print('script ok')"
$H --workspace "$WS" blender_export gen/cube.glb 2>/dev/null | j "assert d['body']['bytes']>0; print('export ok')"
$H --workspace "$WS" blender_load gen/cube.glb 2>/dev/null | j "assert d['body']['totals']['vertices']==8 and d['body']['totals']['triangles']==12, d; print('load ok')"
$H --workspace "$WS" blender_scale_to_size 100 2>/dev/null | j "assert abs(max(d['body']['after']['dimensions_m'])-0.1)<1e-4, d; print('scale ok')"
$H --workspace "$WS" blender_center --floor 2>/dev/null | j "assert d['ok']; print('center ok')"
$H --workspace "$WS" blender_inspect 2>/dev/null | j "o=d['body']['objects'][0]; assert o['is_watertight'] and abs(o['volume_cm3']-1000)<1, o; print('inspect ok: watertight 10cm cube, volume', o['volume_cm3'], 'cm3')"
$H --workspace "$WS" blender_render_preview --views iso --resolution 96 --samples 2 2>/dev/null | j "import os; assert all(os.path.exists(p) for p in d['body']['images']); print('render ok', d['body']['engine_used'])"
$H --workspace "$WS" blender_export out/cube_100mm.glb 2>/dev/null | j "assert d['body']['bytes']>0; print('export2 ok')"
{ $H --workspace "$WS" blender_export /tmp/escape.glb 2>/dev/null || true; } | j "assert d['error']['code']=='PATH_OUTSIDE_WORKSPACE'; print('confinement ok')"
$H --workspace "$WS" --allow-any-path blender_export "$TMP/anywhere.glb" 2>/dev/null | j "assert d['ok']; print('allow-any-path ok')"
test -f "$WS/.hi3d/session.blend" && echo "session.blend ok"
$H --workspace "$WS" blender_session save --path backup/a.blend 2>/dev/null | j "assert d['body']['saved'].endswith('backup/a.blend') and d['body']['session'].endswith('.hi3d/session.blend'); print('session save copy ok')"
$H --workspace "$WS" blender_run_script 'bpy.ops.mesh.primitive_cube_add(size=0.01)' >/dev/null 2>&1
$H --workspace "$WS" blender_session open --path backup/a.blend 2>/dev/null | j "assert d['body']['totals']['objects']==1 and d['body']['session'].endswith('.hi3d/session.blend'), d; print('session open copy keeps autosave target ok')"
$H --workspace "$WS" blender_run_script 'bpy.ops.mesh.primitive_cube_add(size=0.01)' >/dev/null 2>&1
$H --workspace "$WS" blender_session open --path backup/a.blend 2>/dev/null | j "assert d['body']['totals']['objects']==1, 'backup was overwritten by autosave: %s' % d['body']['totals']; print('backup untouched by later edits ok')"

echo "## MCP stdio with image content + retexture (mock Hi3D)"
PORT=8791 node test/mock-hi3d-server.mjs >"$TMP/ak.log" 2>&1 &
sleep 1
python3 - "$TMP/input.png" <<'PY'
import struct, zlib, sys
w = h = 8
raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
PY
export HI3D_BASE_URL=http://127.0.0.1:8791
$H login --mode ak --ak test-ak --sk test-sk >/dev/null
WS2="$TMP/ws2"; mkdir -p "$WS2"
WS="$WS2" IMG="$TMP/input.png" node test/blender-mcp-smoke.mjs
echo "ALL OK"
