/**
 * Proxy routes for Kimi Agent SDK (/v1/providers/kimi-agent/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApprovalResponse } from '@moonshot-ai/kimi-agent-sdk/schema';
import {
  KIMI_AGENT_DEFAULTS,
  mapKimiAgentError,
  kimiAgentPing,
  kimiAgentGetConfig,
  kimiAgentListSessions,
  kimiAgentCreateSession,
  kimiAgentGetSessionEvents,
  kimiAgentDeleteSession,
  kimiAgentSessionPrompt,
  kimiAgentAuthMcp,
  kimiAgentResetAuthMcp,
  kimiAgentTestMcp,
  getActiveKimiTurn,
  forwardToKimiAgentChatStream,
  type KimiAgentProviderConfig,
} from '../providers/kimi-agent.js';

export interface KimiAgentRouteOptions {
  config?: KimiAgentProviderConfig;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

function resolveWorkDir(
  req: IncomingMessage,
  config?: KimiAgentProviderConfig
): string | undefined {
  return header(req, KIMI_AGENT_DEFAULTS.workDirHeader) ?? config?.workDir;
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

function sendMappedError(res: ServerResponse, err: unknown): void {
  const mapped = mapKimiAgentError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

/**
 * Dispatch /v1/providers/kimi-agent/* to Kimi Agent SDK operations.
 */
export async function handleKimiAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: KimiAgentRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/kimi-agent')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/kimi-agent'.length) || '/';
  const config = options?.config;
  const workDir = resolveWorkDir(req, config);

  try {
    if (method === 'GET' && sub === '/ping') {
      const result = await kimiAgentPing(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/config') {
      const cfg = kimiAgentGetConfig(config?.shareDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cfg));
      return true;
    }

    if (method === 'GET' && sub === '/sessions') {
      const sessions = await kimiAgentListSessions(config, workDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sessions));
      return true;
    }

    if (method === 'POST' && sub === '/sessions') {
      const body = (await readJsonBody(req)) as {
        model?: string;
        thinking?: boolean;
        yoloMode?: boolean;
        sessionId?: string;
        workDir?: string;
      };
      const session = kimiAgentCreateSession(config, {
        ...body,
        workDir: body.workDir ?? workDir,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        [KIMI_AGENT_DEFAULTS.sessionHeader]: session.sessionId,
        ...(session.workDir ? { [KIMI_AGENT_DEFAULTS.workDirHeader]: session.workDir } : {}),
      });
      res.end(JSON.stringify({ sessionId: session.sessionId, workDir: session.workDir }));
      return true;
    }

    const eventsMatch = sub.match(/^\/sessions\/([^/]+)\/events$/);
    if (eventsMatch && method === 'GET') {
      const sessionId = eventsMatch[1]!;
      const events = await kimiAgentGetSessionEvents(config, sessionId, workDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(events));
      return true;
    }

    const promptMatch = sub.match(/^\/sessions\/([^/]+)\/prompt$/);
    if (promptMatch && method === 'POST') {
      const sessionId = promptMatch[1]!;
      const body = (await readJsonBody(req)) as {
        message?: string;
        stream?: boolean;
        wait?: boolean;
        model?: string;
      };
      const message = body.message ?? '';

      if (body.stream) {
        const streamResult = await forwardToKimiAgentChatStream(
          body.model ?? config?.model ?? KIMI_AGENT_DEFAULTS.defaultModel,
          [{ role: 'user', content: message }],
          config,
          sessionId,
          workDir
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
          [KIMI_AGENT_DEFAULTS.sessionHeader]: streamResult.sessionId ?? sessionId,
        });
        for await (const chunk of streamResult.stream) {
          res.write(chunk);
        }
        res.end();
        return true;
      }

      if (body.wait !== false) {
        const result = await kimiAgentSessionPrompt(
          config,
          sessionId,
          message,
          workDir,
          body.model
        );
        res.writeHead(200, {
          'Content-Type': 'application/json',
          [KIMI_AGENT_DEFAULTS.sessionHeader]: sessionId,
        });
        res.end(JSON.stringify(result));
        return true;
      }

      const session = kimiAgentCreateSession(config, {
        sessionId,
        workDir,
        model: body.model,
      });
      session.prompt(message);
      res.writeHead(202, {
        'Content-Type': 'application/json',
        [KIMI_AGENT_DEFAULTS.sessionHeader]: session.sessionId,
      });
      res.end(JSON.stringify({ sessionId: session.sessionId, turnStarted: true }));
      return true;
    }

    const interruptMatch = sub.match(/^\/sessions\/([^/]+)\/interrupt$/);
    if (interruptMatch && method === 'POST') {
      const sessionId = interruptMatch[1]!;
      const resolvedWorkDir = workDir ?? config?.workDir ?? process.cwd();
      const turn = getActiveKimiTurn(resolvedWorkDir, sessionId);
      if (!turn) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active turn for session' }));
        return true;
      }
      await turn.interrupt();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ interrupted: true, sessionId }));
      return true;
    }

    const approveMatch = sub.match(/^\/sessions\/([^/]+)\/approve$/);
    if (approveMatch && method === 'POST') {
      const sessionId = approveMatch[1]!;
      const body = (await readJsonBody(req)) as {
        requestId?: string;
        response?: ApprovalResponse;
      };
      const resolvedWorkDir = workDir ?? config?.workDir ?? process.cwd();
      const turn = getActiveKimiTurn(resolvedWorkDir, sessionId);
      if (!turn || !body.requestId || !body.response) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'requestId, response, and active turn required' }));
        return true;
      }
      await turn.approve(body.requestId, body.response);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ approved: true, sessionId, requestId: body.requestId }));
      return true;
    }

    const mcpAuthMatch = sub.match(/^\/mcp\/([^/]+)\/auth$/);
    if (mcpAuthMatch && method === 'POST') {
      await kimiAgentAuthMcp(mcpAuthMatch[1]!, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    const mcpResetMatch = sub.match(/^\/mcp\/([^/]+)\/reset-auth$/);
    if (mcpResetMatch && method === 'POST') {
      await kimiAgentResetAuthMcp(mcpResetMatch[1]!, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    const mcpTestMatch = sub.match(/^\/mcp\/([^/]+)\/test$/);
    if (mcpTestMatch && method === 'POST') {
      const result = await kimiAgentTestMcp(mcpTestMatch[1]!, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    const sessionMatch = sub.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'DELETE') {
      const sessionId = sessionMatch[1]!;
      const deleted = await kimiAgentDeleteSession(config, sessionId, workDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deleted, sessionId }));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Kimi Agent route not found', path: sub }));
    return true;
  } catch (err) {
    sendMappedError(res, err);
    return true;
  }
}
