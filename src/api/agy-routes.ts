/**
 * Proxy routes for AGY agent client (/v1/providers/agy/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AGY_DEFAULTS,
  adkPing,
  adkCreateSession,
  adkListSessions,
  adkGetSession,
  adkDeleteSession,
  adkRunSession,
  mapAgyError,
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
  type AgyProviderConfig,
} from '../providers/agy.js';

export interface AgyRouteOptions {
  config?: AgyProviderConfig;
}

function extractBearer(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice('Bearer '.length).trim() || null;
}

function resolveToken(req: IncomingMessage, config?: AgyProviderConfig): string | null {
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
  const mapped = mapAgyError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

export async function handleAgyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: AgyRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/agy')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/agy'.length) || '/';
  const config = options?.config;
  const token = resolveToken(req, config);
  if (!token) {
    sendError(res, new Error('Missing API key'));
    return true;
  }

  try {
    if (method === 'GET' && sub === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...adkPing(), client: 'agy', appName: AGY_DEFAULTS.appName }));
      return true;
    }

    const userId =
      (req.headers[AGY_DEFAULTS.userHeader] as string | undefined) ?? 'relayplane-agy-user';

    if (method === 'GET' && sub === '/sessions') {
      const sessions = await adkListSessions(token, userId, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sessions));
      return true;
    }

    if (method === 'POST' && sub === '/sessions') {
      const body = await readJsonBody(req);
      const session = await adkCreateSession(
        token,
        (body['userId'] as string | undefined) ?? userId,
        config,
        body['sessionId'] as string | undefined
      );
      res.writeHead(200, {
        'Content-Type': 'application/json',
        [AGY_DEFAULTS.sessionHeader]: session.id,
      });
      res.end(JSON.stringify(session));
      return true;
    }

    const sessionMatch = sub.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      if (method === 'GET') {
        const session = await adkGetSession(token, userId, sessionId, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session ?? null));
        return true;
      }
      if (method === 'DELETE') {
        const result = await adkDeleteSession(token, userId, sessionId, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
    }

    const runMatch = sub.match(/^\/sessions\/([^/]+)\/run$/);
    if (runMatch && method === 'POST') {
      const sessionId = decodeURIComponent(runMatch[1]!);
      const body = await readJsonBody(req);
      const message = (body['message'] as string | undefined) ?? (body['input'] as string | undefined) ?? '';
      const result = await adkRunSession(token, userId, sessionId, message, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: sub }));
    return true;
  } catch (err) {
    sendError(res, err);
    return true;
  }
}
