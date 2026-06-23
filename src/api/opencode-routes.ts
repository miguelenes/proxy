/**
 * Proxy routes for OpenCode agent server (/v1/providers/opencode/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProvidersConfigMap } from '../providers/registry.js';
import {
  mapOpencodeServerError,
  opencodePing,
  opencodeGetConfig,
  opencodeGetProviders,
  opencodeListProjects,
  opencodeCurrentProject,
  opencodeListSessions,
  opencodeCreateSession,
  opencodeGetSession,
  opencodeDeleteSession,
  opencodeSessionPrompt,
  opencodeSessionAbort,
  opencodeSessionMessages,
  opencodeFindText,
  opencodeFindFiles,
  opencodeFileRead,
  opencodeSubscribeEvents,
  unwrapSdkResult,
  type OpencodeServerProviderConfig,
} from '../providers/opencode.js';

export interface OpencodeRouteOptions {
  config?: OpencodeServerProviderConfig;
  providersConfig?: ProvidersConfigMap;
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

function queryFromUrl(req: IncomingMessage): Record<string, string> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function sendMappedError(res: ServerResponse, err: unknown): void {
  const mapped = mapOpencodeServerError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Dispatch /v1/providers/opencode/* to OpenCode SDK operations.
 */
export async function handleOpencodeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: OpencodeRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/opencode')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/opencode'.length) || '/';
  const config = options?.config;
  const providersConfig = options?.providersConfig;

  try {
    if (method === 'GET' && sub === '/ping') {
      const result = await opencodePing(config, providersConfig);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/config') {
      const result = unwrapSdkResult(await opencodeGetConfig(config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/config/providers') {
      const result = unwrapSdkResult(await opencodeGetProviders(config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/projects') {
      const result = unwrapSdkResult(await opencodeListProjects(config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/projects/current') {
      const result = unwrapSdkResult(await opencodeCurrentProject(config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/sessions') {
      const result = unwrapSdkResult(await opencodeListSessions(config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && sub === '/sessions') {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const result = unwrapSdkResult(await opencodeCreateSession(body, config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    const sessionMatch = sub.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      if (method === 'GET') {
        const result = unwrapSdkResult(await opencodeGetSession(sessionId, config, providersConfig));
        sendJson(res, 200, result);
        return true;
      }
      if (method === 'DELETE') {
        const result = unwrapSdkResult(await opencodeDeleteSession(sessionId, config, providersConfig));
        sendJson(res, 200, result);
        return true;
      }
    }

    const promptMatch = sub.match(/^\/sessions\/([^/]+)\/prompt$/);
    if (promptMatch && method === 'POST') {
      const sessionId = decodeURIComponent(promptMatch[1]!);
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const result = unwrapSdkResult(
        await opencodeSessionPrompt(sessionId, body, config, providersConfig)
      );
      sendJson(res, 200, result);
      return true;
    }

    const abortMatch = sub.match(/^\/sessions\/([^/]+)\/abort$/);
    if (abortMatch && method === 'POST') {
      const sessionId = decodeURIComponent(abortMatch[1]!);
      const result = unwrapSdkResult(await opencodeSessionAbort(sessionId, config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    const messagesMatch = sub.match(/^\/sessions\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
      const sessionId = decodeURIComponent(messagesMatch[1]!);
      const result = unwrapSdkResult(await opencodeSessionMessages(sessionId, config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/find/text') {
      const query = queryFromUrl(req);
      const result = unwrapSdkResult(await opencodeFindText(query, config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/find/files') {
      const query = queryFromUrl(req);
      const result = unwrapSdkResult(await opencodeFindFiles(query, config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/file') {
      const query = queryFromUrl(req);
      const result = unwrapSdkResult(await opencodeFileRead(query, config, providersConfig));
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && sub === '/events') {
      const events = await opencodeSubscribeEvents(config, providersConfig);
      const stream = (events as { stream?: AsyncIterable<unknown> }).stream;
      if (!stream) {
        sendMappedError(res, new Error('OpenCode event stream unavailable'));
        return true;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      try {
        for await (const event of stream) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
      }
      res.end();
      return true;
    }

    sendJson(res, 404, { error: 'Not found', path: sub });
    return true;
  } catch (err) {
    sendMappedError(res, err);
    return true;
  }
}
