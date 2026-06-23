/**
 * Metadata routes for OpenCode Go (/v1/providers/opencode-go/models).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProvidersConfigMap } from '../providers/registry.js';
import {
  listOpencodeGoModels,
  mapOpencodeGoError,
  resolveOpencodeGoToken,
  resolveOpencodeTokenFromBearer,
  type OpencodeGoProviderConfig,
} from '../providers/opencode-go.js';

export interface OpencodeGoRouteOptions {
  config?: OpencodeGoProviderConfig;
  providersConfig?: ProvidersConfigMap;
}

function extractBearer(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveToken(req: IncomingMessage, config?: OpencodeGoProviderConfig): string | null {
  return resolveOpencodeTokenFromBearer(extractBearer(req)) ?? resolveOpencodeGoToken(config);
}

export async function handleOpencodeGoRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: OpencodeGoRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/opencode-go')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/opencode-go'.length) || '/';

  if (method === 'GET' && sub === '/models') {
    const token = resolveToken(req, options?.config);
    try {
      const models = await listOpencodeGoModels(token, options?.providersConfig);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(models));
    } catch (err) {
      const mapped = mapOpencodeGoError(err);
      res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
    }
    return true;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: sub }));
  return true;
}
