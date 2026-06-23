/**
 * Metadata routes for OpenCode Zen (/v1/providers/opencode-zen/models).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProvidersConfigMap } from '../providers/registry.js';
import {
  listOpencodeZenModels,
  mapOpencodeZenError,
  resolveOpencodeZenToken,
  resolveOpencodeTokenFromBearer,
  type OpencodeZenProviderConfig,
} from '../providers/opencode-zen.js';

export interface OpencodeZenRouteOptions {
  config?: OpencodeZenProviderConfig;
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

function resolveToken(req: IncomingMessage, config?: OpencodeZenProviderConfig): string | null {
  return resolveOpencodeTokenFromBearer(extractBearer(req)) ?? resolveOpencodeZenToken(config);
}

export async function handleOpencodeZenRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: OpencodeZenRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/opencode-zen')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/opencode-zen'.length) || '/';

  if (method === 'GET' && sub === '/models') {
    const token = resolveToken(req, options?.config);
    try {
      const models = await listOpencodeZenModels(token, {
        providersConfig: options?.providersConfig,
        tier: 'zen',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(models));
    } catch (err) {
      const mapped = mapOpencodeZenError(err);
      res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
    }
    return true;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: sub }));
  return true;
}
