#!/usr/bin/env bash
# End-to-end checks against mock Hi3D servers (no real credentials). Run: npm test
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TMP="$(mktemp -d)"
cleanup() { pkill -f "^node test/mock-" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
H="node packages/cli/dist/main.js"
j() { python3 -c "import json,sys;d=json.load(sys.stdin);exec(sys.argv[1])" "$1"; }

PORT=8790 node test/mock-hi3d-server.mjs >"$TMP/ak.log" 2>&1 &
PORT=8794 node test/mock-hi3d-web-server.mjs >"$TMP/web.log" 2>&1 &
sleep 1
export HI3D_CONFIG_DIR="$TMP/home" HI3D_NO_UPDATE_CHECK=1
export HI3D_WEB_CONSTANTS_JSON='{"appid":"mock-appid","passwordKey":"mock-key-16bytes","paths":{"loginAccount":"/api/auth/login","logout":"/api/auth/logout","renewalToken":"/api/auth/renew","userInfo":"/api/user/info","membershipInfo":"/api/membership","pointAggregation":"/api/points","generateConfig":"/api/generate/config","tosTempToken":"/api/generate/upload-token","submit":"/api/generate/submit","batchResult":"/api/generate/batch-result","pendingJobs":"/api/generate/pending"}}'
python3 - "$TMP/input.png" <<'EOF'
import struct, zlib, sys
w = h = 8
raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
EOF

echo "## ak mode"
export HI3D_BASE_URL=http://127.0.0.1:8790
$H login --mode ak --ak test-ak --sk test-sk | j "assert d['ok'] and d['body']['balance']==1234; print('login ak ok')"
$H who_am_i | j "assert d['body']['authenticated'] and d['body']['authMode']=='ak_sk'; print('who_am_i ok')"
$H image_to_3d "$TMP/input.png" --format glb --poll --download --out "$TMP/out" --name cat 2>/dev/null | j "assert d['body']['state']=='success' and d['body']['files']['model'].endswith('cat.glb'); print('image_to_3d ok')"
$H split_model "$TMP/out/cat.glb" --poll --download --out "$TMP/out" 2>/dev/null | j "assert d['body']['state']=='success'; print('split_model ok')"
{ $H query_task nope || true; } | j "assert not d['ok'] and str(d['error']['code'])=='40040000'; print('error path ok')"
{ $H image_to_3d --face 5 || true; } | j "assert not d['ok'] and d['error']['code']=='BAD_ARGS'; print('arg validation ok')"
$H configure list | j "assert d['body']['current']=='default'; print('configure ok')"
grep -q "^UA hi3d-cli/[^ ]* (cli)$" "$TMP/ak.log" && echo "user-agent (cli) ok" || { echo "user-agent FAILED"; grep "^UA" "$TMP/ak.log"; exit 1; }
unset HI3D_BASE_URL

echo "## web mode"
$H login --mode web --account user@example.com --password Passw0rd --endpoint http://127.0.0.1:8794 --profile me 2>/dev/null | j "assert d['ok'] and d['body']['method']=='password'; print('login web ok')"
$H who_am_i | j "assert d['body']['authMode']=='web_session' and d['body']['balance']==320; print('who_am_i web ok')"
$H image_to_3d https://example.com/x.png --poll --download --out "$TMP/out-web" 2>/dev/null | j "assert d['body']['state']=='success' and d['body']['files']['model']; print('image_to_3d web ok')"
{ $H split_model x.glb || true; } | j "assert d['error']['code']=='UNSUPPORTED_WEB'; print('web unsupported guard ok')"
grep -q "^UA Mozilla/5.0 .* hi3d-cli/[^ ]* (cli)$" "$TMP/web.log" && echo "user-agent web (cli) ok" || { echo "user-agent web FAILED"; grep "^UA" "$TMP/web.log"; exit 1; }
$H configure profile default | j "assert d['body']['current']=='default'; print('profile switch ok')"
{ HI3D_WEB_CONSTANTS_JSON='{"appid":"","passwordKey":""}' $H login --mode web --account a@b.c --password x --endpoint http://127.0.0.1:9 --profile none 2>/dev/null || true; } | j "assert d['error']['code']=='WEB_NOT_CONFIGURED'; print('web not-configured guard ok')"

echo "## blender (no backend needed)"
$H tool_list | j "names=[t['name'] for t in d['body']['tools']]; assert 'blender_render_preview' in names and 'retexture_model' in names; print('tool_list has blender tools:', len(names))"
HI3D_DISABLE_BLENDER=1 $H tool_list | j "assert not any(t['name'].startswith('blender_') for t in d['body']['tools']); print('HI3D_DISABLE_BLENDER ok')"
$H tool_list --no-scripts | j "assert not any(t['name']=='blender_run_script' for t in d['body']['tools']); print('--no-scripts ok')"
$H blender status | j "assert d['ok'] and 'ready' in d['body']; print('blender status ok, ready =', d['body']['ready'])"
{ HI3D_BASE_URL=http://127.0.0.1:8790 $H retexture_model "$TMP/out/cat.glb" || true; } | j "assert d['error']['code']=='BAD_ARGS'; print('retexture guard ok')"
HI3D_BASE_URL=http://127.0.0.1:8790 $H retexture_model "$TMP/out/cat.glb" --image "$TMP/input.png" --poll 2>/dev/null | j "assert d['body']['state']=='success'; print('retexture (mock) ok')"
node test/blender-protocol.mjs
$H | head -1 | grep -q "Usage: hi3d-cli" && echo "no-arg help ok"

echo "## MCP stdio"
MCP_OUT="$(HI3D_BASE_URL=http://127.0.0.1:8790 IMG="$TMP/input.png" node test/mcp-stdio-smoke.mjs 2>"$TMP/mcp.err")"
echo "$MCP_OUT" | grep -q "tools: who_am_i" && echo "$MCP_OUT" | grep -q "image_to_3d: success" && echo "$MCP_OUT" | grep -q "error path: true" && echo "mcp ok" || { echo "mcp FAILED"; echo "$MCP_OUT"; tail -20 "$TMP/mcp.err"; exit 1; }
grep -q "^UA hi3d-cli/[^ ]* (mcp-stdio)$" "$TMP/ak.log" && echo "user-agent (mcp-stdio) ok" || { echo "user-agent mcp FAILED"; grep "^UA" "$TMP/ak.log"; exit 1; }
echo "ALL OK"
