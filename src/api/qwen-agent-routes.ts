/**
 * Proxy routes for Qwen Agent SDK (/v1/providers/qwen-agent/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PermissionMode } from '@qwen-code/sdk';
import {
  QWEN_AGENT_DEFAULTS,
  mapQwenAgentError,
  qwenAgentPing,
  qwenAgentStartSession,
  qwenAgentSessionPrompt,
  qwenAgentCloseSession,
  getActiveQwenQuery,
  forwardToQwenAgentChatStream,
  type QwenAgentProviderConfig,
} from '../providers/qwen-agent.js';

export interface QwenAgentRouteOptions {
  config?: QwenAgentProviderConfig;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

function resolveCwd(
  req: IncomingMessage,
  config?: QwenAgentProviderConfig
): string | undefined {
  return header(req, QWEN_AGENT_DEFAULTS.workDirHeader) ?? config?.cwd ?? config?.workDir;
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
  const mapped = mapQwenAgentError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

/**
 * Dispatch /v1/providers/qwen-agent/* to Qwen Agent SDK operations.
 */
export async function handleQwenAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: QwenAgentRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/qwen-agent')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/qwen-agent'.length) || '/';
  const config = options?.config;
  const cwd = resolveCwd(req, config);

  try {
    if (method === 'GET' && sub === '/ping') {
      const result = await qwenAgentPing(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'POST' && sub === '/query') {
      const body = (await readJsonBody(req)) as {
        prompt?: string;
        model?: string;
        cwd?: string;
        sessionId?: string;
        stream?: boolean;
      };
      const prompt = body.prompt ?? '';
      const workDir = body.cwd ?? cwd;

      if (body.stream) {
        const streamResult = await forwardToQwenAgentChatStream(
          body.model ?? config?.model ?? QWEN_AGENT_DEFAULTS.defaultModel,
          [{ role: 'user', content: prompt }],
          config,
          body.sessionId,
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
          [QWEN_AGENT_DEFAULTS.sessionHeader]: streamResult.sessionId ?? body.sessionId ?? '',
        });
        for await (const chunk of streamResult.stream) {
          res.write(chunk);
        }
        res.end();
        return true;
      }

      const result = await qwenAgentSessionPrompt(
        config,
        body.sessionId ?? '',
        prompt,
        workDir,
        body.model
      );
      res.writeHead(200, {
        'Content-Type': 'application/json',
        [QWEN_AGENT_DEFAULTS.sessionHeader]: result.sessionId,
      });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'POST' && sub === '/sessions') {
      const body = (await readJsonBody(req)) as {
        model?: string;
        cwd?: string;
        sessionId?: string;
      };
      const session = qwenAgentStartSession(config, {
        ...body,
        cwd: body.cwd ?? cwd,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        [QWEN_AGENT_DEFAULTS.sessionHeader]: session.sessionId,
        [QWEN_AGENT_DEFAULTS.workDirHeader]: session.cwd,
      });
      res.end(JSON.stringify(session));
      return true;
    }

    const promptMatch = sub.match(/^\/sessions\/([^/]+)\/prompt$/);
    if (promptMatch && method === 'POST') {
      const sessionId = promptMatch[1]!;
      const body = (await readJsonBody(req)) as {
        message?: string;
        stream?: boolean;
        model?: string;
      };
      const message = body.message ?? '';

      if (body.stream) {
        const streamResult = await forwardToQwenAgentChatStream(
          body.model ?? config?.model ?? QWEN_AGENT_DEFAULTS.defaultModel,
          [{ role: 'user', content: message }],
          config,
          sessionId,
          cwd
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
          [QWEN_AGENT_DEFAULTS.sessionHeader]: streamResult.sessionId ?? sessionId,
        });
        for await (const chunk of streamResult.stream) {
          res.write(chunk);
        }
        res.end();
        return true;
      }

      const result = await qwenAgentSessionPrompt(config, sessionId, message, cwd, body.model);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        [QWEN_AGENT_DEFAULTS.sessionHeader]: sessionId,
      });
      res.end(JSON.stringify(result));
      return true;
    }

    const interruptMatch = sub.match(/^\/sessions\/([^/]+)\/interrupt$/);
    if (interruptMatch && method === 'POST') {
      const sessionId = interruptMatch[1]!;
      const resolvedCwd = cwd ?? config?.cwd ?? process.cwd();
      const q = getActiveQwenQuery(resolvedCwd, sessionId);
      if (!q) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active query for session' }));
        return true;
      }
      await q.interrupt();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ interrupted: true, sessionId }));
      return true;
    }

    const permissionMatch = sub.match(/^\/sessions\/([^/]+)\/permission-mode$/);
    if (permissionMatch && method === 'POST') {
      const sessionId = permissionMatch[1]!;
      const body = (await readJsonBody(req)) as { mode?: PermissionMode };
      const resolvedCwd = cwd ?? config?.cwd ?? process.cwd();
      const q = getActiveQwenQuery(resolvedCwd, sessionId);
      if (!q || !body.mode) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mode and active query required' }));
        return true;
      }
      await q.setPermissionMode(body.mode);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, mode: body.mode }));
      return true;
    }

    const modelMatch = sub.match(/^\/sessions\/([^/]+)\/model$/);
    if (modelMatch && method === 'POST') {
      const sessionId = modelMatch[1]!;
      const body = (await readJsonBody(req)) as { model?: string };
      const resolvedCwd = cwd ?? config?.cwd ?? process.cwd();
      const q = getActiveQwenQuery(resolvedCwd, sessionId);
      if (!q || !body.model) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'model and active query required' }));
        return true;
      }
      await q.setModel(body.model);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, model: body.model }));
      return true;
    }

    const contextMatch = sub.match(/^\/sessions\/([^/]+)\/context-usage$/);
    if (contextMatch && method === 'GET') {
      const sessionId = contextMatch[1]!;
      const resolvedCwd = cwd ?? config?.cwd ?? process.cwd();
      const q = getActiveQwenQuery(resolvedCwd, sessionId);
      if (!q) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active query for session' }));
        return true;
      }
      const usage = await q.getContextUsage();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usage));
      return true;
    }

    const mcpMatch = sub.match(/^\/sessions\/([^/]+)\/mcp-status$/);
    if (mcpMatch && method === 'GET') {
      const sessionId = mcpMatch[1]!;
      const resolvedCwd = cwd ?? config?.cwd ?? process.cwd();
      const q = getActiveQwenQuery(resolvedCwd, sessionId);
      if (!q) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active query for session' }));
        return true;
      }
      const status = await q.mcpServerStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return true;
    }

    const commandsMatch = sub.match(/^\/sessions\/([^/]+)\/commands$/);
    if (commandsMatch && method === 'GET') {
      const sessionId = commandsMatch[1]!;
      const resolvedCwd = cwd ?? config?.cwd ?? process.cwd();
      const q = getActiveQwenQuery(resolvedCwd, sessionId);
      if (!q) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active query for session' }));
        return true;
      }
      const commands = await q.supportedCommands();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(commands));
      return true;
    }

    const sessionMatch = sub.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'DELETE') {
      const sessionId = sessionMatch[1]!;
      await qwenAgentCloseSession(config, sessionId, cwd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deleted: true, sessionId }));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Qwen Agent route not found', path: sub }));
    return true;
  } catch (err) {
    sendMappedError(res, err);
    return true;
  }
}
