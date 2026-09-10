#!/usr/bin/env node
/**
 * hi3d-mcp — Hi3D MCP server.
 *   hi3d-mcp                 stdio, local mode (file paths + sandbox tools)
 *   hi3d-mcp --http [port]   Streamable HTTP, remote mode (URLs only), stateless
 *
 * Remote auth (phase 1): each request may carry `Authorization: Basic base64(AK:SK)`
 * or `Authorization: Bearer AK:SK`; otherwise the server's own credentials are used.
 * Phase 2 replaces this with OAuth 2.1 (DCR + PKCE) in front of the same handler.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Credentials, loadCredentials } from '@hi3d/core';
import { createServer } from './server.js';

export interface StdioOptions {
  outDir?: string;
  workspace?: string;
  confinePaths?: boolean;
  scripts?: boolean;
}

export async function runStdio(opts: StdioOptions = {}) {
  const { server, ctx } = createServer({ mode: 'local', outDir: opts.outDir, workspace: opts.workspace, confinePaths: opts.confinePaths, scripts: opts.scripts, log: (m) => process.stderr.write(m + '\n') });
  const transport = new StdioServerTransport();
  const shutdown = () => {
    ctx.dispose();
  };
  transport.onclose = shutdown;
  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
  process.on('exit', shutdown);
  await server.connect(transport);
}

function credsFromHeader(h: string | undefined): Credentials | undefined {
  if (!h) return undefined;
  const [scheme, value] = h.split(/\s+/, 2);
  if (!value) return undefined;
  let raw = value;
  if (/^basic$/i.test(scheme)) raw = Buffer.from(value, 'base64').toString('utf8');
  else if (!/^bearer$/i.test(scheme)) return undefined;
  const i = raw.indexOf(':');
  if (i <= 0) return undefined;
  return { clientId: raw.slice(0, i), clientSecret: raw.slice(i + 1) };
}

export async function runHttp(port: number, opts: { path?: string; requireAuth?: boolean } = {}) {
  const mcpPath = opts.path ?? '/mcp';
  const serverCreds = loadCredentials();
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (url.pathname !== mcpPath) {
      res.writeHead(404).end();
      return;
    }
    const creds = credsFromHeader(req.headers.authorization) ?? (opts.requireAuth ? undefined : serverCreds);
    if (!creds) {
      res
        .writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Basic realm="hi3d"' })
        .end(JSON.stringify({ error: 'unauthorized', hint: 'Authorization: Basic base64(clientId:clientSecret)' }));
      return;
    }
    // stateless: fresh server + transport per request
    const { server, ctx } = createServer({ mode: 'remote', credentials: creds, log: (m) => process.stderr.write(m + '\n') });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
      ctx.dispose();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      process.stderr.write(`[mcp-http] ${(e as Error).message}\n`);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  await new Promise<void>((r) => httpServer.listen(port, r));
  process.stderr.write(`hi3d-mcp listening on http://0.0.0.0:${port}${mcpPath} (remote mode, id ${randomUUID().slice(0, 8)})\n`);
  return httpServer;
}

export async function main(argv = process.argv.slice(2)) {
  const httpIdx = argv.indexOf('--http');
  if (httpIdx >= 0) {
    const port = Number(argv[httpIdx + 1] ?? process.env.PORT ?? 8787) || 8787;
    await runHttp(port, { requireAuth: argv.includes('--require-auth') });
    return;
  }
  const val = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  await runStdio({ outDir: val('--out'), workspace: val('--workspace'), confinePaths: !argv.includes('--allow-any-path'), scripts: !argv.includes('--no-scripts') });
}

const isDirect = process.argv[1] && /hi3d-mcp$|[\\/]mcp[\\/]dist[\\/]main\.js$/.test(process.argv[1]);
if (isDirect) {
  main().catch((e) => {
    process.stderr.write(`hi3d-mcp: ${(e as Error).stack ?? e}\n`);
    process.exit(1);
  });
}
