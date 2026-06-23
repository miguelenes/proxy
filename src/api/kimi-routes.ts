/**
 * Proxy routes for Kimi / Moonshot cloud API (/v1/providers/kimi/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  KIMI_DEFAULTS,
  kimiGetBalance,
  kimiListModels,
  kimiEstimateTokens,
  kimiUploadFile,
  kimiListFiles,
  kimiGetFile,
  kimiDeleteFile,
  kimiGetFileContent,
  kimiPing,
  mapKimiError,
  resolveKimiApiKey,
  resolveKimiApiKeyFromBearer,
  type KimiProviderConfig,
} from '../providers/kimi.js';
import type { ProvidersConfigMap } from '../providers/registry.js';

export interface KimiRouteOptions {
  config?: KimiProviderConfig;
  providersConfig?: ProvidersConfigMap;
}

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveRouteApiKey(
  req: IncomingMessage,
  config?: KimiProviderConfig
): string | null {
  return (
    resolveKimiApiKeyFromBearer(extractBearerToken(req)) ?? resolveKimiApiKey(config)
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw.toString('utf8')) as unknown;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { error: 'Invalid JSON from Kimi / Moonshot API' };
  }
}

function sendMissingKey(res: ServerResponse): void {
  const mapped = mapKimiError(401, { error: 'Missing API key' });
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

function proxyUpstreamJson(
  res: ServerResponse,
  upstream: Response,
  body: unknown
): void {
  if (!upstream.ok) {
    const mapped = mapKimiError(upstream.status, body);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }
  res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Dispatch /v1/providers/kimi/* to Moonshot cloud metadata APIs.
 */
export async function handleKimiRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: KimiRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/kimi')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/kimi'.length) || '/';
  const config = options?.config;
  const providersConfig = options?.providersConfig;
  const apiKey = resolveRouteApiKey(req, config);

  if (!apiKey && sub !== '/ping') {
    sendMissingKey(res);
    return true;
  }

  try {
    if (method === 'GET' && sub === '/ping') {
      if (!apiKey) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            hint: `Set ${KIMI_DEFAULTS.apiKeyEnv} or pass Authorization: Bearer`,
          })
        );
        return true;
      }
      const result = await kimiPing(apiKey, config, providersConfig);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/balance') {
      const upstream = await kimiGetBalance(apiKey!, config, providersConfig);
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    if (method === 'GET' && sub === '/models') {
      const upstream = await kimiListModels(apiKey!, config, providersConfig);
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    if (method === 'POST' && sub === '/tokenizers/estimate-token-count') {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const upstream = await kimiEstimateTokens(apiKey!, body, config, providersConfig);
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    if (method === 'POST' && sub === '/files') {
      const raw = await readRawBody(req);
      const contentType = req.headers['content-type'];
      const upstream = await kimiUploadFile(
        apiKey!,
        raw,
        typeof contentType === 'string' ? contentType : undefined,
        config,
        providersConfig
      );
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    if (method === 'GET' && sub === '/files') {
      const upstream = await kimiListFiles(apiKey!, config, providersConfig);
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    const fileContentMatch = sub.match(/^\/files\/([^/]+)\/content$/);
    if (fileContentMatch && method === 'GET') {
      const fileId = fileContentMatch[1]!;
      const upstream = await kimiGetFileContent(apiKey!, fileId, config, providersConfig);
      if (!upstream.ok) {
        proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
        return true;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
      res.writeHead(upstream.status, { 'Content-Type': contentType });
      res.end(buffer);
      return true;
    }

    const fileMatch = sub.match(/^\/files\/([^/]+)$/);
    if (fileMatch && method === 'GET') {
      const fileId = fileMatch[1]!;
      const upstream = await kimiGetFile(apiKey!, fileId, config, providersConfig);
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    if (fileMatch && method === 'DELETE') {
      const fileId = fileMatch[1]!;
      const upstream = await kimiDeleteFile(apiKey!, fileId, config, providersConfig);
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Kimi route not found', path: sub }));
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message, hint: 'Kimi / Moonshot API request failed' }));
    return true;
  }
}
