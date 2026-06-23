/**
 * Proxy routes for Cursor team APIs (/v1/providers/cursor/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  CURSOR_DEFAULTS,
  isAllowedCursorPath,
  mapCursorError,
  cursorRequest,
} from '../providers/cursor.js';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

function decodeBasicApiKey(authHeader: string): string | null {
  if (!authHeader.startsWith('Basic ')) {
    return null;
  }
  try {
    const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    const username = colon >= 0 ? decoded.slice(0, colon) : decoded;
    const key = username.trim();
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function resolveCursorApiKey(
  req: IncomingMessage,
  apiKeyEnv: string = CURSOR_DEFAULTS.apiKeyEnv
): string | null {
  const auth = req.headers['authorization'];
  if (auth) {
    const basicKey = decodeBasicApiKey(auth);
    if (basicKey) {
      return basicKey;
    }
    const bearer = extractBearerToken(req);
    if (bearer) {
      return bearer;
    }
  }
  return process.env[apiKeyEnv] ?? null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) {
    return undefined;
  }
  return JSON.parse(raw.toString('utf8')) as unknown;
}

function sendCursorMissingKey(res: ServerResponse): void {
  const mapped = mapCursorError(401, { error: 'Missing API key' });
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

function getIfNoneMatch(req: IncomingMessage): string | undefined {
  const value = req.headers['if-none-match'];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function extractQueryFromUrl(url: string): string {
  const qIndex = url.indexOf('?');
  return qIndex >= 0 ? url.slice(qIndex) : '';
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

function pickResponseHeaders(upstream: Response): Record<string, string> {
  const out: Record<string, string> = {};
  const etag = upstream.headers.get('etag');
  if (etag) {
    out['ETag'] = etag;
  }
  const cacheControl = upstream.headers.get('cache-control');
  if (cacheControl) {
    out['Cache-Control'] = cacheControl;
  }
  return out;
}

async function pipeCsvUpstream(res: ServerResponse, upstream: Response): Promise<void> {
  if (!upstream.ok) {
    const errBody = await readErrorBody(upstream);
    const mapped = mapCursorError(upstream.status, errBody);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const contentType = upstream.headers.get('content-type') ?? 'text/csv; charset=utf-8';
  const headers = { 'Content-Type': contentType, ...pickResponseHeaders(upstream) };
  res.writeHead(upstream.status, headers);
  if (upstream.body) {
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

async function pipeJsonUpstream(res: ServerResponse, upstream: Response): Promise<void> {
  if (upstream.status === 304) {
    res.writeHead(304, pickResponseHeaders(upstream));
    res.end();
    return;
  }

  if (!upstream.ok) {
    const errBody = await readErrorBody(upstream);
    const mapped = mapCursorError(upstream.status, errBody);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const body = await upstream.arrayBuffer();
  res.writeHead(upstream.status, {
    'Content-Type': contentType,
    ...pickResponseHeaders(upstream),
  });
  res.end(Buffer.from(body));
}

export interface CursorRouteOptions {
  apiKeyEnv?: string;
  baseUrl?: string;
}

/**
 * Dispatch /v1/providers/cursor/* to upstream Cursor team APIs.
 * Returns true if the route was handled.
 */
export async function handleCursorRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: CursorRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/cursor')) {
    return false;
  }

  const upstreamPath = pathname.slice('/v1/providers/cursor'.length) || '/';
  if (!isAllowedCursorPath(upstreamPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Cursor route not allowed',
        hint: 'Allowed prefixes: /teams/, /settings/, /analytics/',
        path: upstreamPath,
      })
    );
    return true;
  }

  if (!ALLOWED_METHODS.has(method)) {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed', method }));
    return true;
  }

  const apiKey = resolveCursorApiKey(req, options?.apiKeyEnv ?? CURSOR_DEFAULTS.apiKeyEnv);
  if (!apiKey) {
    sendCursorMissingKey(res);
    return true;
  }

  const query = extractQueryFromUrl(req.url ?? '');
  const ifNoneMatch = getIfNoneMatch(req);

  let body: unknown;
  if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
    try {
      body = await readJsonBody(req);
    } catch {
      const mapped = mapCursorError(400, { error: 'Invalid JSON body' });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mapped));
      return true;
    }
  }

  const upstream = await cursorRequest(
    method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
    upstreamPath,
    apiKey,
    { query, body, ifNoneMatch, baseUrl: options?.baseUrl }
  );

  if (upstreamPath.endsWith('.csv')) {
    await pipeCsvUpstream(res, upstream);
  } else {
    await pipeJsonUpstream(res, upstream);
  }

  return true;
}
