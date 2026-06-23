/**
 * Qwen Code Agent SDK provider — local sessions via @qwen-code/sdk query().
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import {
  query,
  isSDKAssistantMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
  isAbortError,
  type Query,
  type QueryOptions,
  type PermissionMode,
  type SDKAssistantMessage,
  type ContentBlock,
  type ExtendedUsage,
} from '@qwen-code/sdk';

export const QWEN_AGENT_DEFAULTS = {
  defaultModel: 'qwen-plus',
  maxWaitMs: 120_000,
  sessionHeader: 'x-qwen-session-id',
  workDirHeader: 'x-qwen-work-dir',
  sentinelApiKey: 'qwen-agent-local',
} as const;

export interface QwenAgentProviderConfig {
  enabled?: boolean;
  cwd?: string;
  workDir?: string;
  model?: string;
  permissionMode?: PermissionMode;
  approveAllTools?: boolean;
  pathToQwenExecutable?: string;
  authType?: QueryOptions['authType'];
  maxWaitMs?: number;
  includePartialMessages?: boolean;
  allowedTools?: string[];
  excludeTools?: string[];
  coreTools?: string[];
  maxSessionTurns?: number;
  env?: Record<string, string>;
}

const activeQueryByKey = new Map<string, Query>();

function sessionCacheKey(cwd: string, sessionId: string): string {
  return `${cwd}:${sessionId}`;
}

function resolveCwd(config?: QwenAgentProviderConfig, override?: string | null): string {
  return override?.trim() || config?.cwd?.trim() || config?.workDir?.trim() || process.cwd();
}

function resolveModel(model: string, config?: QwenAgentProviderConfig): string {
  if (config?.model?.trim()) {
    return config.model.trim();
  }
  const stripped = model.replace(/^qwen-agent\/?/i, '').trim();
  return stripped.length > 0 ? stripped : QWEN_AGENT_DEFAULTS.defaultModel;
}

function resolvePermissionMode(config?: QwenAgentProviderConfig): PermissionMode {
  if (config?.permissionMode) {
    return config.permissionMode;
  }
  if (config?.approveAllTools) {
    return 'yolo';
  }
  return 'default';
}

function buildQueryEnv(config?: QwenAgentProviderConfig): Record<string, string> {
  const env: Record<string, string> = { ...(config?.env ?? {}) };
  if (!env['DASHSCOPE_API_KEY'] && process.env['DASHSCOPE_API_KEY']) {
    env['DASHSCOPE_API_KEY'] = process.env['DASHSCOPE_API_KEY']!;
  }
  if (!env['OPENAI_API_KEY'] && process.env['OPENAI_API_KEY']) {
    env['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY']!;
  } else if (!env['OPENAI_API_KEY'] && process.env['DASHSCOPE_API_KEY']) {
    env['OPENAI_API_KEY'] = process.env['DASHSCOPE_API_KEY']!;
  }
  if (!env['OPENAI_BASE_URL'] && process.env['OPENAI_BASE_URL']) {
    env['OPENAI_BASE_URL'] = process.env['OPENAI_BASE_URL']!;
  }
  if (!env['QWEN_MODEL'] && process.env['QWEN_MODEL']) {
    env['QWEN_MODEL'] = process.env['QWEN_MODEL']!;
  }
  return env;
}

export function buildQwenQueryOptions(
  config: QwenAgentProviderConfig | undefined,
  model: string,
  cwd: string,
  sessionId?: string | null,
  resume?: string | null,
  streaming?: boolean
): QueryOptions {
  return {
    cwd,
    model,
    permissionMode: resolvePermissionMode(config),
    env: buildQueryEnv(config),
    includePartialMessages: streaming ?? config?.includePartialMessages ?? true,
    ...(config?.pathToQwenExecutable ? { pathToQwenExecutable: config.pathToQwenExecutable } : {}),
    ...(config?.authType ? { authType: config.authType } : {}),
    ...(config?.allowedTools ? { allowedTools: config.allowedTools } : {}),
    ...(config?.excludeTools ? { excludeTools: config.excludeTools } : {}),
    ...(config?.coreTools ? { coreTools: config.coreTools } : {}),
    ...(config?.maxSessionTurns !== undefined ? { maxSessionTurns: config.maxSessionTurns } : {}),
    ...(resume?.trim() ? { resume: resume.trim() } : {}),
    ...(sessionId?.trim() && !resume ? { sessionId: sessionId.trim() } : {}),
  };
}

export function mapQwenAgentError(err: unknown): { error: string; hint: string; status: number } {
  if (isAbortError(err)) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: message,
      hint: 'Qwen agent query was aborted or timed out',
      status: 504,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('unauthorized') || lower.includes('auth') || lower.includes('401')) {
    return {
      error: message,
      hint: 'Set DASHSCOPE_API_KEY / OPENAI_API_KEY or configure qwen-oauth via Qwen Code CLI',
      status: 401,
    };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      error: message,
      hint: `Increase providers.qwen-agent.maxWaitMs (default ${QWEN_AGENT_DEFAULTS.maxWaitMs}ms)`,
      status: 504,
    };
  }
  if (lower.includes('enoent') || lower.includes('spawn') || lower.includes('not found')) {
    return {
      error: message,
      hint: 'Qwen Code CLI failed to start — @qwen-code/sdk bundles CLI; check pathToQwenExecutable',
      status: 502,
    };
  }
  if (lower.includes('closed')) {
    return {
      error: message,
      hint: 'Session is closed — start a new session without resume',
      status: 409,
    };
  }

  return {
    error: message,
    hint: 'Qwen Agent SDK error — check auth, cwd, and permissionMode',
    status: 502,
  };
}

export function extractTextFromContentBlocks(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .map((block) => {
      if (block.type === 'text') {
        return block.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function extractTextFromAssistantMessage(message: SDKAssistantMessage): string {
  return extractTextFromContentBlocks(message.message.content);
}

export function extractTextDeltaFromPartialMessage(event: {
  event?: { type?: string; delta?: { type?: string; text?: string } };
}): string {
  const evt = event.event;
  if (evt?.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
    return evt.delta.text ?? '';
  }
  return '';
}

export function usageToOpenAi(usage?: ExtendedUsage): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
} {
  if (!usage) {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  return {
    prompt_tokens: usage.input_tokens ?? 0,
    completion_tokens: usage.output_tokens ?? 0,
    total_tokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    cache_read_input_tokens: usage.cache_read_input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
  };
}

export function partialMessageToSseChunk(
  delta: string,
  completionId: string,
  model: string,
  created: number
): string {
  const chunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export function extractQwenAgentPrompt(
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
  usage?: ExtendedUsage
): Record<string, unknown> {
  return {
    id: `chatcmpl-qwen-agent-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
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
    usage: usageToOpenAi(usage),
  };
}

async function collectQueryMessages(
  q: Query,
  maxWaitMs: number
): Promise<{
  text: string;
  usage?: ExtendedUsage;
  sessionId: string;
}> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Qwen agent query timed out after ${maxWaitMs}ms`)), maxWaitMs);
  });

  const iterate = (async () => {
    let text = '';
    let usage: ExtendedUsage | undefined;
    for await (const message of q) {
      if (isSDKAssistantMessage(message)) {
        text = extractTextFromAssistantMessage(message);
        usage = message.message.usage;
      } else if (isSDKResultMessage(message)) {
        if (message.subtype === 'success' && message.result) {
          text = text || message.result;
        }
        usage = message.usage ?? usage;
        if (message.is_error) {
          throw new Error(message.error?.message ?? 'Qwen agent query failed');
        }
      }
    }
    return { text, usage, sessionId: q.getSessionId() };
  })();

  return Promise.race([iterate, timeout]);
}

export function getActiveQwenQuery(cwd: string, sessionId: string): Query | undefined {
  return activeQueryByKey.get(sessionCacheKey(cwd, sessionId));
}

export async function qwenAgentPing(config?: QwenAgentProviderConfig): Promise<{
  ok: true;
  cwd: string;
  sdk: string;
}> {
  return {
    ok: true,
    cwd: resolveCwd(config),
    sdk: '@qwen-code/sdk',
  };
}

export function qwenAgentStartSession(
  config: QwenAgentProviderConfig | undefined,
  body: { model?: string; cwd?: string; sessionId?: string }
): { sessionId: string; cwd: string } {
  const cwd = resolveCwd(config, body.cwd);
  const model = body.model ?? resolveModel(QWEN_AGENT_DEFAULTS.defaultModel, config);
  const sessionId = body.sessionId?.trim() || randomUUID();
  const q = query({
    prompt: '',
    options: buildQwenQueryOptions(config, model, cwd, sessionId),
  });
  activeQueryByKey.set(sessionCacheKey(cwd, sessionId), q);
  return { sessionId: q.getSessionId(), cwd };
}

export async function qwenAgentSessionPrompt(
  config: QwenAgentProviderConfig | undefined,
  sessionId: string,
  message: string,
  cwdOverride?: string | null,
  model?: string
): Promise<{ text: string; usage?: ExtendedUsage; sessionId: string }> {
  const cwd = resolveCwd(config, cwdOverride);
  const resolvedModel = model ?? resolveModel(QWEN_AGENT_DEFAULTS.defaultModel, config);
  const maxWait = config?.maxWaitMs ?? QWEN_AGENT_DEFAULTS.maxWaitMs;
  const q = query({
    prompt: message,
    options: buildQwenQueryOptions(config, resolvedModel, cwd, null, sessionId),
  });
  const key = sessionCacheKey(cwd, sessionId);
  activeQueryByKey.set(key, q);
  try {
    return await collectQueryMessages(q, maxWait);
  } finally {
    activeQueryByKey.delete(key);
    try {
      await q.close();
    } catch {
      // ignore close errors
    }
  }
}

export async function qwenAgentCloseSession(
  config: QwenAgentProviderConfig | undefined,
  sessionId: string,
  cwdOverride?: string | null
): Promise<void> {
  const cwd = resolveCwd(config, cwdOverride);
  const key = sessionCacheKey(cwd, sessionId);
  const q = activeQueryByKey.get(key);
  if (q) {
    await q.close();
    activeQueryByKey.delete(key);
  }
}

export async function forwardToQwenAgentChat(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  config?: QwenAgentProviderConfig,
  sessionId?: string | null,
  cwdOverride?: string | null
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  sessionId?: string;
  error?: { message: string; status: number };
}> {
  const maxWait = config?.maxWaitMs ?? QWEN_AGENT_DEFAULTS.maxWaitMs;
  const cwd = resolveCwd(config, cwdOverride);
  const resolvedModel = resolveModel(model, config);
  const prompt = extractQwenAgentPrompt(messages);

  try {
    const q = query({
      prompt,
      options: buildQwenQueryOptions(
        config,
        resolvedModel,
        cwd,
        sessionId,
        sessionId ?? undefined,
        false
      ),
    });
    const key = sessionCacheKey(cwd, q.getSessionId());
    activeQueryByKey.set(key, q);
    const { text, usage, sessionId: sid } = await collectQueryMessages(q, maxWait);
    return {
      success: true,
      data: toChatCompletion(text, model, usage),
      sessionId: sid,
    };
  } catch (err) {
    const mapped = mapQwenAgentError(err);
    return {
      success: false,
      error: { message: mapped.error, status: mapped.status },
    };
  } finally {
    if (sessionId) {
      activeQueryByKey.delete(sessionCacheKey(resolveCwd(config, cwdOverride), sessionId));
    }
  }
}

export async function forwardToQwenAgentChatStream(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  config?: QwenAgentProviderConfig,
  sessionId?: string | null,
  cwdOverride?: string | null
): Promise<{
  success: boolean;
  sessionId?: string;
  stream?: AsyncGenerator<string>;
  error?: { message: string; status: number };
}> {
  const maxWait = config?.maxWaitMs ?? QWEN_AGENT_DEFAULTS.maxWaitMs;
  const completionId = `chatcmpl-qwen-agent-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const created = Math.floor(Date.now() / 1000);
  const cwd = resolveCwd(config, cwdOverride);
  const resolvedModel = resolveModel(model, config);
  const prompt = extractQwenAgentPrompt(messages);

  try {
    const q = query({
      prompt,
      options: buildQwenQueryOptions(
        config,
        resolvedModel,
        cwd,
        sessionId,
        sessionId ?? undefined,
        true
      ),
    });
    const sid = q.getSessionId();
    const key = sessionCacheKey(cwd, sid);
    activeQueryByKey.set(key, q);

    async function* generateStream(): AsyncGenerator<string> {
      const timer = setTimeout(() => {
        void q.interrupt();
      }, maxWait);

      try {
        for await (const message of q) {
          if (isSDKPartialAssistantMessage(message)) {
            const delta = extractTextDeltaFromPartialMessage(message);
            if (delta) {
              yield partialMessageToSseChunk(delta, completionId, model, created);
            }
          } else if (isSDKAssistantMessage(message)) {
            const text = extractTextFromAssistantMessage(message);
            if (text) {
              yield partialMessageToSseChunk(text, completionId, model, created);
            }
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
        clearTimeout(timer);
        activeQueryByKey.delete(key);
      }
    }

    return {
      success: true,
      sessionId: sid,
      stream: generateStream(),
    };
  } catch (err) {
    const mapped = mapQwenAgentError(err);
    return {
      success: false,
      error: { message: mapped.error, status: mapped.status },
    };
  }
}
