#!/usr/bin/env node
/** Generate docs/wiki/Tool-Reference.md from the MCP tool table (run after `npm run build`). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.HI3D_NO_UPDATE_CHECK = '1';
const { listTools } = await import('../packages/mcp/dist/index.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = listTools(true);
const flag = (k) => '--' + k.replace(/_/g, '-');
function typeOf(p) {
  if (p.enum) return p.enum.map((v) => `\`${v}\``).join(' \\| ');
  if (p.type === 'array') return `${p.items?.type ?? 'string'}[]`;
  if (p.anyOf) return p.anyOf.map(typeOf).join(' \\| ');
  return p.type ?? 'string';
}
let md = `# Tool / command reference

*Generated from the tool table by \`node scripts/gen-wiki-tools.mjs\` — do not edit by hand.*
Every MCP tool is also a CLI command with the same name; a parameter \`foo_bar\` is the CLI flag \`--foo-bar\`.
Output is always \`{ ok, status, body }\`; errors \`{ ok:false, error:{ code, message } }\`.

| Tool | Group | Read-only | Summary |
|---|---|---|---|
`;
for (const t of tools) md += `| [\`${t.name}\`](#${t.name}) | ${t.feature ?? 'hi3d'} | ${t.annotations?.readOnlyHint ? 'yes' : ''} | ${t.title} |\n`;
for (const t of tools) {
  md += `\n## ${t.name}\n\n${t.description}\n\n`;
  const props = t.inputSchema.properties ?? {};
  const req = new Set(t.inputSchema.required ?? []);
  if (Object.keys(props).length) {
    md += '| Parameter | CLI flag | Type | Required | Description |\n|---|---|---|---|---|\n';
    for (const [k, p] of Object.entries(props)) md += `| \`${k}\` | \`${flag(k)}\` | ${typeOf(p)} | ${req.has(k) ? 'yes' : ''} | ${(p.description ?? '').replace(/\|/g, '\\|')} |\n`;
  } else md += '_No parameters._\n';
}
fs.writeFileSync(path.join(root, 'docs', 'wiki', 'Tool-Reference.md'), md);
console.log(`docs/wiki/Tool-Reference.md: ${tools.length} tools`);
