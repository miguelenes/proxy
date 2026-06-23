/**
 * GitHub Copilot SDK provider — agent sessions via bundled Copilot CLI (JSON-RPC).
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import {
  CopilotClient,
  approveAll,
  type CopilotSession,
  type SessionConfig,
  type ProviderConfig,
  type SessionListFilter,
} from '@github/copilot-sdk';

export const COPILOT_DEFAULTS = {
  apiKeyEnv: 'COPILOT_GITHUB_TOKEN',
  fallbackTokenEnv: 'GITHUB_TOKEN',
  defaultModel: 'auto',
  maxWaitMs: 120_000,
  sessionHeader: 'x-copilot-session-id',
} as const;

export interface CopilotProviderConfig {
  enabled?: boolean;
  model?: string;
  apiKeyEnv?: string;
  gitHubToken?: string;
  useLoggedInUser?: boolean;
  workingDirectory?: string;
  baseDirectory?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  maxWaitMs?: number;
  approveAllTools?: boolean;
  sessionIdleTimeoutSeconds?: number;
  provider?: ProviderConfig;
}

interface ClientEntry {
  client: CopilotClient;
  ready: Promise<void>;
}

const clientByToken = new Map<string, ClientEntry>();
const sessionByKey = new Map<string, CopilotSession>();

export function resolveCopilotToken(config?: CopilotProviderConfig): string | null {
  if (config?.gitHubToken?.trim()) {
    return config.gitHubToken.trim();
  }
  const primary = process.env[config?.apiKeyEnv ?? COPILOT_DEFAULTS.apiKeyEnv];
  if (primary?.trim()) {
    return primary.trim();
  }
  const fallback = process.env[COPILOT_DEFAULTS.fallbackTokenEnv];
  return fallback?.trim() ? fallback.trim() : null;
}

export function resolveCopilotTokenFromBearer(bearer: string | null | undefined): string | null {
  if (!bearer?.trim()) {
    return null;
  }
  return bearer.trim();
}

export function mapCopilotError(err: unknown): { error: string; hint: string; status: number } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('unauthorized') || lower.includes('auth') || lower.includes('401')) {
    return {
      error: message,
      hint: 'Verify COPILOT_GITHUB_TOKEN or GITHUB_TOKEN — Copilot subscription required',
      status: 401,
    };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      error: message,
      hint: `Copilot session exceeded max wait — increase providers.copilot.maxWaitMs (default ${COPILOT_DEFAULTS.maxWaitMs}ms)`,
      status: 504,
    };
  }
  if (lower.includes('enoent') || lower.includes('spawn') || lower.includes('cli')) {
    return {
      error: message,
      hint: 'Copilot CLI failed to start — requires Node.js >=20.19 and a supported OS',
      status: 502,
    };
  }

  return {
    error: message,
    hint: 'Copilot SDK error — check token, Node version, and CLI logs',
    status: 502,
  };
}

function sessionCacheKey(token: string, sessionId: string): string {
  return `${token}:${sessionId}`;
}

function resolveModel(model: string, config?: CopilotProviderConfig): string {
  const fromConfig = config?.model;
  if (fromConfig) {
    return fromConfig;
  }
  const stripped = model.replace(/^copilot\/?/i, '').trim();
  return stripped.length > 0 ? stripped : COPILOT_DEFAULTS.defaultModel;
}

function buildSessionConfig(
  config: CopilotProviderConfig | undefined,
  model: string,
  streaming?: boolean
): SessionConfig {
  const sessionConfig: SessionConfig = {
    model,
    ...(config?.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
    ...(config?.provider ? { provider: config.provider } : {}),
    ...(streaming ? { streaming: true } : {}),
  };
  if (config?.approveAllTools !== false) {
    sessionConfig.onPermissionRequest = approveAll;
  }
  return sessionConfig;
}

async function getCopilotClient(
  token: string,
  config?: CopilotProviderConfig
): Promise<CopilotClient> {
  let entry = clientByToken.get(token);
  if (!entry) {
    const client = new CopilotClient({
      gitHubToken: token,
      useLoggedInUser: config?.useLoggedInUser ?? false,
      workingDirectory: config?.workingDirectory,
      baseDirectory: config?.baseDirectory,
      sessionIdleTimeoutSeconds: config?.sessionIdleTimeoutSeconds,
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: token,
        GITHUB_TOKEN: token,
      },
    });
    const ready = client.start();
    entry = { client, ready };
    clientByToken.set(token, entry);
  }
  await entry.ready;
  return entry.client;
}

export async function getOrCreateCopilotSession(
  token: string,
  config: CopilotProviderConfig | undefined,
  model: string,
  existingSessionId?: string | null,
  streaming?: boolean
): Promise<CopilotSession> {
  const client = await getCopilotClient(token, config);
  const sessionConfig = buildSessionConfig(config, model, streaming);

  if (existingSessionId?.trim()) {
    const key = sessionCacheKey(token, existingSessionId);
    const cached = sessionByKey.get(key);
    if (cached) {
      return cached;
    }
    try {
      const resumed = await client.resumeSession(existingSessionId, sessionConfig);
      sessionByKey.set(key, resumed);
      return resumed;
    } catch {
      // Stale id — create fresh below
    }
  }

  const session = await client.createSession(sessionConfig);
  sessionByKey.set(sessionCacheKey(token, session.sessionId), session);
  return session;
}

export function extractCopilotPrompt(
  messages: Array<{ role?: string; content?: unknown }>
): string {
  const contentFrom = (msg: { content?: unknown }): string => {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((c: unknown) => {
          const part = c as { type?: string; text?: string };
          return part.text ?? '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (msg.content !== undefined) return JSON.stringify(msg.content);
    return '';
  };

  const systemText = messages
    .filter((m) => m.role === 'system')
    .map(contentFrom)
    .filter(Boolean)
    .join('\n\n');

  const userMessages = messages.filter((m) => m.role === 'user');
  const lastUser = userMessages[userMessages.length - 1] ?? messages[messages.length - 1];
  const userText = lastUser ? contentFrom(lastUser) : '';

  if (systemText && userText) {
    return `${systemText}\n\n${userText}`;
  }
  return userText || systemText;
}

function toChatCompletion(text: string, model: string): Record<string, unknown> {
  return {
    id: `chatcmpl-copilot-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function extractAssistantText(
  event: { data?: { content?: string } } | undefined
): string {
  return event?.data?.content ?? '';
}

// --- SDK wrappers ---

export async function copilotPing(
  token: string,
  config?: CopilotProviderConfig
): Promise<{ message: string; timestamp: string }> {
  const client = await getCopilotClient(token, config);
  return client.ping();
}

export async function copilotListSessions(
  token: string,
  config?: CopilotProviderConfig,
  filter?: SessionListFilter
) {
  const client = await getCopilotClient(token, config);
  return client.listSessions(filter);
}

export async function copilotCreateSession(
  token: string,
  body: SessionConfig,
  config?: CopilotProviderConfig
): Promise<CopilotSession> {
  const client = await getCopilotClient(token, config);
  const sessionConfig: SessionConfig = {
    ...body,
    ...(body.onPermissionRequest ? {} : config?.approveAllTools !== false ? { onPermissionRequest: approveAll } : {}),
  };
  const session = await client.createSession(sessionConfig);
  sessionByKey.set(sessionCacheKey(token, session.sessionId), session);
  return session;
}

export async function copilotResumeSession(
  token: string,
  sessionId: string,
  body: SessionConfig | undefined,
  config?: CopilotProviderConfig
): Promise<CopilotSession> {
  const client = await getCopilotClient(token, config);
  const session = await client.resumeSession(sessionId, body ?? {});
  sessionByKey.set(sessionCacheKey(token, session.sessionId), session);
  return session;
}

export async function copilotDeleteSession(
  token: string,
  sessionId: string,
  config?: CopilotProviderConfig
): Promise<void> {
  const client = await getCopilotClient(token, config);
  await client.deleteSession(sessionId);
  sessionByKey.delete(sessionCacheKey(token, sessionId));
}

async function getCachedSession(
  token: string,
  sessionId: string,
  config?: CopilotProviderConfig
): Promise<CopilotSession> {
  const key = sessionCacheKey(token, sessionId);
  const cached = sessionByKey.get(key);
  if (cached) {
    return cached;
  }
  return copilotResumeSession(token, sessionId, undefined, config);
}

export async function copilotSendAndWait(
  token: string,
  sessionId: string,
  prompt: string,
  config?: CopilotProviderConfig,
  timeout?: number
) {
  const session = await getCachedSession(token, sessionId, config);
  return session.sendAndWait({ prompt }, timeout);
}

export async function copilotGetEvents(
  token: string,
  sessionId: string,
  config?: CopilotProviderConfig
) {
  const session = await getCachedSession(token, sessionId, config);
  return session.getEvents();
}

export async function copilotAbort(
  token: string,
  sessionId: string,
  config?: CopilotProviderConfig
): Promise<void> {
  const session = await getCachedSession(token, sessionId, config);
  await session.abort();
}

// --- Chat adapter ---

export async function forwardToCopilotChat(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  config?: CopilotProviderConfig,
  sessionId?: string | null,
  bearerToken?: string | null
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  sessionId?: string;
  error?: { message: string; status: number };
}> {
  const token = bearerToken ?? resolveCopilotToken(config);
  if (!token) {
    return {
      success: false,
      error: {
        message: 'Missing Copilot GitHub token',
        status: 401,
      },
    };
  }

  const resolvedModel = resolveModel(model, config);
  const maxWait = config?.maxWaitMs ?? COPILOT_DEFAULTS.maxWaitMs;

  try {
    const session = await getOrCreateCopilotSession(
      token,
      config,
      resolvedModel,
      sessionId,
      false
    );
    const prompt = extractCopilotPrompt(messages);
    const response = await session.sendAndWait({ prompt }, maxWait);
    const text = extractAssistantText(response);
    return {
      success: true,
      data: toChatCompletion(text, model),
      sessionId: session.sessionId,
    };
  } catch (err) {
    const mapped = mapCopilotError(err);
    return {
      success: false,
      error: { message: mapped.error, status: mapped.status },
    };
  }
}

export async function forwardToCopilotChatStream(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  config?: CopilotProviderConfig,
  sessionId?: string | null,
  bearerToken?: string | null
): Promise<{
  success: boolean;
  sessionId?: string;
  stream?: AsyncGenerator<string>;
  error?: { message: string; status: number };
}> {
  const token = bearerToken ?? resolveCopilotToken(config);
  if (!token) {
    return {
      success: false,
      error: { message: 'Missing Copilot GitHub token', status: 401 },
    };
  }

  const resolvedModel = resolveModel(model, config);
  const maxWait = config?.maxWaitMs ?? COPILOT_DEFAULTS.maxWaitMs;
  const completionId = `chatcmpl-copilot-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const created = Math.floor(Date.now() / 1000);

  try {
    const session = await getOrCreateCopilotSession(
      token,
      config,
      resolvedModel,
      sessionId,
      true
    );
    const prompt = extractCopilotPrompt(messages);

    async function* generateStream(): AsyncGenerator<string> {
      const queue: string[] = [];
      let idle = false;
      let streamError: Error | null = null;

      const unsubDelta = session.on('assistant.message_delta', (event) => {
        const delta = event.data?.deltaContent ?? '';
        if (delta) {
          queue.push(delta);
        }
      });
      const unsubIdle = session.on('session.idle', () => {
        idle = true;
      });
      const unsubError = session.on('session.error', (event) => {
        streamError = new Error(event.data?.message ?? 'Copilot session error');
        idle = true;
      });

      const timeout = setTimeout(() => {
        streamError = new Error(`Copilot session timed out after ${maxWait}ms`);
        idle = true;
      }, maxWait);

      try {
        await session.send({ prompt });

        while (!idle || queue.length > 0) {
          if (streamError) {
            throw streamError;
          }
          while (queue.length > 0) {
            const delta = queue.shift()!;
            const chunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
            };
            yield `data: ${JSON.stringify(chunk)}\n\n`;
          }
          if (!idle) {
            await new Promise((r) => setTimeout(r, 50));
          }
        }

        const finalChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        };
        yield `data: ${JSON.stringify(finalChunk)}\n\n`;
        yield 'data: [DONE]\n\n';
      } finally {
        clearTimeout(timeout);
        unsubDelta();
        unsubIdle();
        unsubError();
      }
    }

    return {
      success: true,
      sessionId: session.sessionId,
      stream: generateStream(),
    };
  } catch (err) {
    const mapped = mapCopilotError(err);
    return {
      success: false,
      error: { message: mapped.error, status: mapped.status },
    };
  }
}
