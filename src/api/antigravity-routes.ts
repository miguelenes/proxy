/**
 * Proxy routes for Antigravity managed agent (/v1/providers/antigravity/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ANTIGRAVITY_DEFAULTS,
  antigravityCreateInteraction,
  antigravityGetInteraction,
  antigravityCancelInteraction,
  mapAntigravityError,
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
  type AntigravityProviderConfig,
} from '../providers/antigravity.js';

export interface AntigravityRouteOptions {
  config?: AntigravityProviderConfig;
}

function extractBearer(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice('Bearer '.length).trim() || null;
}

function resolveToken(req: IncomingMessage, config?: AntigravityProviderConfig): string | null {
  return resolveGoogleApiKeyFromBearer(extractBearer(req)) ?? resolveGoogleApiKey(config);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
}

function sendError(res: ServerResponse, err: unknown): void {
  const mapped = mapAntigravityError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

export async function handleAntigravityRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: AntigravityRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/antigravity')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/antigravity'.length) || '/';
  const config = options?.config;
  const token = resolveToken(req, config);
  if (!token) {
    sendError(res, new Error('Missing API key'));
    return true;
  }

  try {
    if (method === 'GET' && sub === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          agent: config?.agent ?? ANTIGRAVITY_DEFAULTS.defaultAgent,
        })
      );
      return true;
    }

    if (method === 'POST' && sub === '/interactions') {
      const body = await readJsonBody(req);
      const interaction = await antigravityCreateInteraction(token, body, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(interaction));
      return true;
    }

    const interactionMatch = sub.match(/^\/interactions\/([^/]+)$/);
    if (interactionMatch) {
      const id = decodeURIComponent(interactionMatch[1]!);
      if (method === 'GET') {
        const interaction = await antigravityGetInteraction(token, id, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(interaction));
        return true;
      }
      if (method === 'DELETE') {
        const result = await antigravityCancelInteraction(token, id, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: sub }));
    return true;
  } catch (err) {
    sendError(res, err);
    return true;
  }
}
