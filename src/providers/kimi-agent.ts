/**
 * Kimi Agent SDK provider — local kimi CLI sessions via @moonshot-ai/kimi-agent-sdk.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  createSession,
  listSessions,
  deleteSession,
  parseSessionEvents,
  parseConfig,
  saveDefaultModel,
  authMCP,
  resetAuthMCP,
  testMCP,
  collectText,
  type Session,
} from '@moonshot-ai/kimi-agent-sdk';
import type {
  ContentPart,
  StreamEvent,
  TokenUsage,
  WireEvent,
  ApprovalResponse,
} from '@moonshot-ai/kimi-agent-sdk/schema';
import {
  isAgentSdkError,
  getErrorCode,
  getErrorCategory,
} from '@moonshot-ai/kimi-agent-sdk/errors';

export const KIMI_AGENT_DEFAULTS = {
  executable: 'kimi',
  defaultModel: 'kimi-latest',
  maxWaitMs: 120_000,
  sessionHeader: 'x-kimi-session-id',
  workDirHeader: 'x-kimi-work-dir',
  sentinelApiKey: 'kimi-agent-local',
} as const;

export interface KimiAgentProviderConfig {
  enabled?: boolean;
  workDir?: string;
  executable?: string;
  model?: string;
  thinking?: boolean;
  yoloMode?: boolean;
  approveAllTools?: boolean;
  maxWaitMs?: number;
  env?: Record<string, string>;
  shareDir?: string;
}

interface TurnLike {
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent, { status: string }, undefined>;
  interrupt(): Promise<void>;
  approve(requestId: string, response: ApprovalResponse): Promise<void>;
  readonly result: Promise<{ status: string }>;
}

const sessionByKey = new Map<string, Session>();
const activeTurnByKey = new Map<string, TurnLike>();

export function isKimiCliAvailable(executable: string = KIMI_AGENT_DEFAULTS.executable): boolean {
  try {
    execSync(`command -v ${executable}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function mapKimiAgentError(err: unknown): { error: string; hint: string; status: number } {
  if (isAgentSdkError(err)) {
    const code = getErrorCode(err);
    const category = getErrorCategory(err);
    const message = err instanceof Error ? err.message : String(err);

    if (code === 'CLI_NOT_FOUND' || category === 'cli') {
      return {
        error: message,
        hint: 'Install the kimi CLI and ensure it is on PATH — see docs/providers/kimi-agent.md',
        status: 502,
      };
    }
    if (
      code?.toLowerCase().includes('auth') ||
      message.toLowerCase().includes('unauthorized')
    ) {
      return {
        error: message,
        hint: 'Run `kimi login` or set MOONSHOT_API_KEY for CLI auth',
        status: 401,
      };
    }
    if (category === 'session') {
      return {
        error: message,
        hint: 'Session error — create a new session or check workDir',
        status: 404,
      };
    }
    return {
      error: message,
      hint: `Kimi Agent SDK error (${code ?? 'unknown'})`,
      status: 502,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      error: message,
      hint: `Increase providers.kimi-agent.maxWaitMs (default ${KIMI_AGENT_DEFAULTS.maxWaitMs}ms)`,
      status: 504,
    };
  }
  if (lower.includes('enoent') || lower.includes('spawn') || lower.includes('not found')) {
    return {
      error: message,
      hint: 'kimi CLI not found — install from Moonshot / Kimi Code docs',
      status: 502,
    };
  }
  return {
    error: message,
    hint: 'Kimi Agent SDK error — check CLI install, workDir, and auth',
    status: 502,
  };
}

function sessionCacheKey(workDir: string, sessionId: string): string {
  return `${workDir}:${sessionId}`;
}

function resolveWorkDir(
  config?: KimiAgentProviderConfig,
  override?: string | null
): string {
  return override?.trim() || config?.workDir?.trim() || process.cwd();
}

function resolveModel(model: string, config?: KimiAgentProviderConfig): string {
  if (config?.model?.trim()) {
    return config.model.trim();
  }
  const stripped = model.replace(/^kimi-agent\/?/i, '').trim();
  return stripped.length > 0 ? stripped : KIMI_AGENT_DEFAULTS.defaultModel;
}

function resolveYoloMode(config?: KimiAgentProviderConfig): boolean {
  if (config?.yoloMode !== undefined) {
    return config.yoloMode;
  }
  if (config?.approveAllTools) {
    return true;
  }
  return false;
}

function buildCliEnv(config?: KimiAgentProviderConfig): Record<string, string> {
  const env: Record<string, string> = { ...(config?.env ?? {}) };
  if (!env['MOONSHOT_API_KEY'] && process.env['MOONSHOT_API_KEY']) {
    env['MOONSHOT_API_KEY'] = process.env['MOONSHOT_API_KEY']!;
  }
  if (!env['KIMI_API_KEY'] && process.env['KIMI_API_KEY']) {
    env['KIMI_API_KEY'] = process.env['KIMI_API_KEY']!;
  }
  return env;
}

function buildSessionOptions(
  config: KimiAgentProviderConfig | undefined,
  model: string,
  workDir: string,
  sessionId?: string
) {
  return {
    workDir,
    ...(sessionId ? { sessionId } : {}),
    model,
    thinking: config?.thinking ?? false,
    yoloMode: resolveYoloMode(config),
    executable: config?.executable ?? KIMI_AGENT_DEFAULTS.executable,
    env: buildCliEnv(config),
    ...(config?.shareDir ? { shareDir: config.shareDir } : {}),
  };
}

export function isWireEvent(event: StreamEvent): event is WireEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    !('method' in event) &&
    !('error' in event && 'line' in event)
  );
}

export function extractTextDeltaFromEvent(event: StreamEvent): string {
  if (!isWireEvent(event) || event.type !== 'ContentPart') {
    return '';
  }
  const part = event.payload as ContentPart;
  if (part.type === 'text') {
    return part.text;
  }
  return '';
}

export function extractTokenUsageFromEvent(event: StreamEvent): TokenUsage | null {
  if (!isWireEvent(event) || event.type !== 'StatusUpdate') {
    return null;
  }
  return event.payload.token_usage ?? null;
}

export function tokenUsageToOpenAi(usage: TokenUsage | null): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} {
  if (!usage) {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  const prompt =
    usage.input_other + usage.input_cache_read + usage.input_cache_creation;
  const completion = usage.output;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  };
}

export function streamEventToSseChunk(
  event: StreamEvent,
  completionId: string,
  model: string,
  created: number
): string | null {
  const delta = extractTextDeltaFromEvent(event);
  if (!delta) {
    return null;
  }
  const chunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export function getOrCreateKimiAgentSession(
  config: KimiAgentProviderConfig | undefined,
  model: string,
  existingSessionId?: string | null,
  workDirOverride?: string | null
): Session {
  const workDir = resolveWorkDir(config, workDirOverride);
  const resolvedModel = resolveModel(model, config);

  if (existingSessionId?.trim()) {
    const key = sessionCacheKey(workDir, existingSessionId);
    const cached = sessionByKey.get(key);
    if (cached && cached.state !== 'closed') {
      return cached;
    }
    const session = createSession(
      buildSessionOptions(config, resolvedModel, workDir, existingSessionId)
    );
    sessionByKey.set(key, session);
    return session;
  }

  const session = createSession(buildSessionOptions(config, resolvedModel, workDir));
  sessionByKey.set(sessionCacheKey(workDir, session.sessionId), session);
  return session;
}

export function extractKimiAgentPrompt(
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

function toChatCompletion(
  text: string,
  model: string,
  usage: TokenUsage | null
): Record<string, unknown> {
  const openAiUsage = tokenUsageToOpenAi(usage);
  return {
    id: `chatcmpl-kimi-agent-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
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
    usage: openAiUsage,
  };
}

async function collectTurnResult(
  turn: TurnLike,
  maxWaitMs: number
): Promise<{ events: StreamEvent[]; result: { status: string }; usage: TokenUsage | null }> {
  const events: StreamEvent[] = [];
  let usage: TokenUsage | null = null;
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Kimi agent turn timed out after ${maxWaitMs}ms`)),
      maxWaitMs
    );
  });

  const iterate = (async () => {
    for await (const event of turn) {
      events.push(event);
      const eventUsage = extractTokenUsageFromEvent(event);
      if (eventUsage) {
        usage = eventUsage;
      }
    }
    const result = await turn.result;
    return { events, result, usage };
  })();

  return Promise.race([iterate, timeout]);
}

// --- SDK wrappers ---

export async function kimiAgentPing(config?: KimiAgentProviderConfig): Promise<{
  ok: true;
  cli: string;
  workDir: string;
}> {
  const executable = config?.executable ?? KIMI_AGENT_DEFAULTS.executable;
  if (!isKimiCliAvailable(executable)) {
    throw new Error(`kimi CLI not found: ${executable}`);
  }
  parseConfig(config?.shareDir);
  return {
    ok: true,
    cli: executable,
    workDir: resolveWorkDir(config),
  };
}

export function kimiAgentGetConfig(shareDir?: string) {
  return parseConfig(shareDir);
}

export async function kimiAgentListSessions(
  config?: KimiAgentProviderConfig,
  workDirOverride?: string | null
) {
  const workDir = resolveWorkDir(config, workDirOverride);
  return listSessions(workDir);
}

export function kimiAgentCreateSession(
  config: KimiAgentProviderConfig | undefined,
  body: {
    model?: string;
    thinking?: boolean;
    yoloMode?: boolean;
    sessionId?: string;
    workDir?: string;
  }
): Session {
  const workDir = resolveWorkDir(config, body.workDir);
  const model = body.model ?? resolveModel(KIMI_AGENT_DEFAULTS.defaultModel, config);
  const merged: KimiAgentProviderConfig = {
    ...config,
    ...(body.thinking !== undefined ? { thinking: body.thinking } : {}),
    ...(body.yoloMode !== undefined ? { yoloMode: body.yoloMode } : {}),
  };
  return getOrCreateKimiAgentSession(merged, model, body.sessionId, workDir);
}

export async function kimiAgentGetSessionEvents(
  config: KimiAgentProviderConfig | undefined,
  sessionId: string,
  workDirOverride?: string | null
) {
  const workDir = resolveWorkDir(config, workDirOverride);
  return parseSessionEvents(workDir, sessionId);
}

export async function kimiAgentDeleteSession(
  config: KimiAgentProviderConfig | undefined,
  sessionId: string,
  workDirOverride?: string | null
): Promise<boolean> {
  const workDir = resolveWorkDir(config, workDirOverride);
  const deleted = await deleteSession(workDir, sessionId);
  sessionByKey.delete(sessionCacheKey(workDir, sessionId));
  activeTurnByKey.delete(sessionCacheKey(workDir, sessionId));
  return deleted;
}

export function kimiAgentSaveDefaultModel(
  modelId: string,
  thinking?: boolean,
  shareDir?: string
): void {
  saveDefaultModel(modelId, thinking, shareDir);
}

export async function kimiAgentAuthMcp(
  serverName: string,
  config?: KimiAgentProviderConfig
): Promise<void> {
  await authMCP(serverName, {
    executable: config?.executable,
    env: buildCliEnv(config),
  });
}

export async function kimiAgentResetAuthMcp(
  serverName: string,
  config?: KimiAgentProviderConfig
): Promise<void> {
  await resetAuthMCP(serverName, {
    executable: config?.executable,
    env: buildCliEnv(config),
  });
}

export async function kimiAgentTestMcp(
  serverName: string,
  config?: KimiAgentProviderConfig
) {
  return testMCP(serverName, {
    executable: config?.executable,
    env: buildCliEnv(config),
  });
}

export function getActiveKimiTurn(
  workDir: string,
  sessionId: string
): TurnLike | undefined {
  return activeTurnByKey.get(sessionCacheKey(workDir, sessionId));
}

export async function kimiAgentSessionPrompt(
  config: KimiAgentProviderConfig | undefined,
  sessionId: string,
  message: string,
  workDirOverride?: string | null,
  model?: string
): Promise<{ events: StreamEvent[]; result: { status: string }; usage: TokenUsage | null }> {
  const workDir = resolveWorkDir(config, workDirOverride);
  const session = getOrCreateKimiAgentSession(
    config,
    model ?? resolveModel(KIMI_AGENT_DEFAULTS.defaultModel, config),
    sessionId,
    workDir
  );
  const turn = session.prompt(message) as TurnLike;
  activeTurnByKey.set(sessionCacheKey(workDir, sessionId), turn);
  const maxWait = config?.maxWaitMs ?? KIMI_AGENT_DEFAULTS.maxWaitMs;
  try {
    return await collectTurnResult(turn, maxWait);
  } finally {
    activeTurnByKey.delete(sessionCacheKey(workDir, sessionId));
  }
}

// --- Chat adapter ---

export async function forwardToKimiAgentChat(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  config?: KimiAgentProviderConfig,
  sessionId?: string | null,
  workDirOverride?: string | null
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  sessionId?: string;
  error?: { message: string; status: number };
}> {
  const maxWait = config?.maxWaitMs ?? KIMI_AGENT_DEFAULTS.maxWaitMs;

  try {
    const session = getOrCreateKimiAgentSession(config, model, sessionId, workDirOverride);
    const prompt = extractKimiAgentPrompt(messages);
    const turn = session.prompt(prompt) as TurnLike;
    const key = sessionCacheKey(session.workDir, session.sessionId);
    activeTurnByKey.set(key, turn);

    const { events, usage } = await collectTurnResult(turn, maxWait);
    const text = collectText(events);
    return {
      success: true,
      data: toChatCompletion(text, model, usage),
      sessionId: session.sessionId,
    };
  } catch (err) {
    const mapped = mapKimiAgentError(err);
    return {
      success: false,
      error: { message: mapped.error, status: mapped.status },
    };
  } finally {
    const workDir = resolveWorkDir(config, workDirOverride);
    if (sessionId) {
      activeTurnByKey.delete(sessionCacheKey(workDir, sessionId));
    }
  }
}

export async function forwardToKimiAgentChatStream(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  config?: KimiAgentProviderConfig,
  sessionId?: string | null,
  workDirOverride?: string | null
): Promise<{
  success: boolean;
  sessionId?: string;
  stream?: AsyncGenerator<string>;
  error?: { message: string; status: number };
}> {
  const maxWait = config?.maxWaitMs ?? KIMI_AGENT_DEFAULTS.maxWaitMs;
  const completionId = `chatcmpl-kimi-agent-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const created = Math.floor(Date.now() / 1000);

  try {
    const session = getOrCreateKimiAgentSession(config, model, sessionId, workDirOverride);
    const prompt = extractKimiAgentPrompt(messages);
    const turn = session.prompt(prompt) as TurnLike;
    const key = sessionCacheKey(session.workDir, session.sessionId);
    activeTurnByKey.set(key, turn);

    async function* generateStream(): AsyncGenerator<string> {
      const timeout = setTimeout(() => {
        void turn.interrupt();
      }, maxWait);

      try {
        for await (const event of turn) {
          const chunk = streamEventToSseChunk(event, completionId, model, created);
          if (chunk) {
            yield chunk;
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
        activeTurnByKey.delete(key);
      }
    }

    return {
      success: true,
      sessionId: session.sessionId,
      stream: generateStream(),
    };
  } catch (err) {
    const mapped = mapKimiAgentError(err);
    return {
      success: false,
      error: { message: mapped.error, status: mapped.status },
    };
  }
}
