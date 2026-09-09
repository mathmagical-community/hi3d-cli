import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const t = new StdioClientTransport({ command: 'node', args: ['packages/cli/dist/main.js', 'mcp'], env: process.env });
const c = new Client({ name: 't', version: '0' }); await c.connect(t);
const tools = await c.listTools(); console.log('tools:', tools.tools.map(x => x.name).join(','));
const r = await c.callTool({ name: 'who_am_i', arguments: {} }); console.log('who_am_i:', String(JSON.parse(r.content[0].text).balance));
const q = await c.callTool({ name: 'image_to_3d', arguments: { image: process.env.IMG, poll: true, format: 'glb' } }); console.log('image_to_3d:', JSON.parse(q.content[0].text).state);
const e = await c.callTool({ name: 'query_task', arguments: { task_id: 'nope' } }); console.log('error path:', String(e.isError), String(JSON.parse(e.content[0].text).error.code));
await c.close();
