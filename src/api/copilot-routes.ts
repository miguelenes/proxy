/**
 * Proxy routes for GitHub Copilot SDK (/v1/providers/copilot/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionConfig } from '@github/copilot-sdk';
import {
  COPILOT_DEFAULTS,
  mapCopilotError,
  resolveCopilotToken,
  resolveCopilotTokenFromBearer,
  copilotPing,
  copilotListSessions,
  copilotCreateSession,
  copilotResumeSession,
  copilotDeleteSession,
  copilotSendAndWait,
  copilotGetEvents,
  copilotAbort,
  forwardToCopilotChatStream,
  type CopilotProviderConfig,
} from '../providers/copilot.js';

export interface CopilotRouteOptions {
  config?: CopilotProviderConfig;
}

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveRouteToken(
  req: IncomingMessage,
  config?: CopilotProviderConfig
): string | null {
  return (
    resolveCopilotTokenFromBearer(extractBearerToken(req)) ?? resolveCopilotToken(config)
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

function sendMissingToken(res: ServerResponse): void {
  const mapped = mapCopilotError(new Error('Missing GitHub token'));
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

function sendMappedError(res: ServerResponse, err: unknown): void {
  const mapped = mapCopilotError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

/**
 * Dispatch /v1/providers/copilot/* to Copilot SDK operations.
 */
export async function handleCopilotRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: CopilotRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/copilot')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/copilot'.length) || '/';
  const config = options?.config;
  const token = resolveRouteToken(req, config);
  if (!token) {
    sendMissingToken(res);
    return true;
  }

  try {
    if (method === 'GET' && sub === '/ping') {
      const result = await copilotPing(token, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/sessions') {
      const result = await copilotListSessions(token, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'POST' && sub === '/sessions') {
      const body = (await readJsonBody(req)) as SessionConfig;
      const session = await copilotCreateSession(token, body, config);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        [COPILOT_DEFAULTS.sessionHeader]: session.sessionId,
      });
      res.end(JSON.stringify({ sessionId: session.sessionId }));
      return true;
    }

    const resumeMatch = sub.match(/^\/sessions\/([^/]+)\/resume$/);
    if (resumeMatch && method === 'POST') {
      const sessionId = resumeMatch[1]!;
      const body = (await readJsonBody(req)) as SessionConfig;
      const session = await copilotResumeSession(token, sessionId, body, config);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        [COPILOT_DEFAULTS.sessionHeader]: session.sessionId,
      });
      res.end(JSON.stringify({ sessionId: session.sessionId }));
      return true;
    }

    const sessionMatch = sub.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'DELETE') {
      const sessionId = sessionMatch[1]!;
      await copilotDeleteSession(token, sessionId, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deleted: true, sessionId }));
      return true;
    }

    const eventsMatch = sub.match(/^\/sessions\/([^/]+)\/events$/);
    if (eventsMatch && method === 'GET') {
      const sessionId = eventsMatch[1]!;
      const events = await copilotGetEvents(token, sessionId, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(events));
      return true;
    }

    const abortMatch = sub.match(/^\/sessions\/([^/]+)\/abort$/);
    if (abortMatch && method === 'POST') {
      const sessionId = abortMatch[1]!;
      await copilotAbort(token, sessionId, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ aborted: true, sessionId }));
      return true;
    }

    const messagesMatch = sub.match(/^\/sessions\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'POST') {
      const sessionId = messagesMatch[1]!;
      const body = (await readJsonBody(req)) as {
        prompt?: string;
        wait?: boolean;
        timeout?: number;
        stream?: boolean;
      };
      const prompt = body.prompt ?? '';
      const timeout = body.timeout ?? config?.maxWaitMs ?? COPILOT_DEFAULTS.maxWaitMs;

      if (body.stream) {
        const streamResult = await forwardToCopilotChatStream(
          config?.model ?? COPILOT_DEFAULTS.defaultModel,
          [{ role: 'user', content: prompt }],
          config,
          sessionId,
          token
        );
        if (!streamResult.success || !streamResult.stream) {
          res.writeHead(streamResult.error?.status ?? 502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: streamResult.error }));
          return true;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          [COPILOT_DEFAULTS.sessionHeader]: streamResult.sessionId ?? sessionId,
        });
        for await (const chunk of streamResult.stream) {
          res.write(chunk);
        }
        res.end();
        return true;
      }

      if (body.wait !== false) {
        const response = await copilotSendAndWait(token, sessionId, prompt, config, timeout);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          [COPILOT_DEFAULTS.sessionHeader]: sessionId,
        });
        res.end(JSON.stringify(response));
        return true;
      }

      const session = await copilotResumeSession(token, sessionId, undefined, config);
      const messageId = await session.send({ prompt });
      res.writeHead(202, {
        'Content-Type': 'application/json',
        [COPILOT_DEFAULTS.sessionHeader]: sessionId,
      });
      res.end(JSON.stringify({ messageId, sessionId }));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Copilot route not found', path: sub }));
    return true;
  } catch (err) {
    sendMappedError(res, err);
    return true;
  }
}
