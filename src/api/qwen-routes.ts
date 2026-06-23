/**
 * Proxy routes for Qwen / DashScope cloud API (/v1/providers/qwen/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  QWEN_DEFAULTS,
  qwenListModels,
  qwenPing,
  mapQwenError,
  resolveQwenApiKey,
  resolveQwenApiKeyFromBearer,
  type QwenProviderConfig,
} from '../providers/qwen.js';
import type { ProvidersConfigMap } from '../providers/registry.js';

export interface QwenRouteOptions {
  config?: QwenProviderConfig;
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
  config?: QwenProviderConfig
): string | null {
  return (
    resolveQwenApiKeyFromBearer(extractBearerToken(req)) ?? resolveQwenApiKey(config)
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { error: 'Invalid JSON from DashScope' };
  }
}

function sendMissingKey(res: ServerResponse): void {
  const mapped = mapQwenError(401, { error: 'Missing API key' });
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

function proxyUpstreamJson(
  res: ServerResponse,
  upstream: Response,
  body: unknown
): void {
  if (!upstream.ok) {
    const mapped = mapQwenError(upstream.status, body);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }
  res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Dispatch /v1/providers/qwen/* to DashScope metadata APIs.
 */
export async function handleQwenRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: QwenRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/qwen')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/qwen'.length) || '/';
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
            hint: `Set ${QWEN_DEFAULTS.apiKeyEnv} or pass Authorization: Bearer`,
          })
        );
        return true;
      }
      const result = await qwenPing(apiKey, config, providersConfig);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/models') {
      const upstream = await qwenListModels(apiKey!, config, providersConfig);
      proxyUpstreamJson(res, upstream, await readJsonResponse(upstream));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Qwen route not found', path: sub }));
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message, hint: 'DashScope API request failed' }));
    return true;
  }
}
