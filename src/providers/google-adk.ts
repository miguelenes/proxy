/**
 * Google ADK provider — agent sessions via @google/adk (Runner, LlmAgent, tools).
 *
 * @packageDocumentation
 */

import {
  BuiltInCodeExecutor,
  GOOGLE_SEARCH,
  InMemoryRunner,
  LlmAgent,
  isFinalResponse,
  stringifyContent,
  version as adkVersion,
  type Event,
} from '@google/adk';
import type { Content } from '@google/genai';
import {
  GOOGLE_API_DEFAULTS,
  mapGoogleError,
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
  type GoogleApiKeyConfig,
} from './google-shared.js';
import type { ChatRequestBody } from './shared.js';

export {
  GOOGLE_API_DEFAULTS,
  mapGoogleError,
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
};

export const GOOGLE_ADK_DEFAULTS = {
  appName: 'relayplane-adk',
  defaultModel: 'gemini-2.5-flash',
  defaultUserId: 'relayplane-user',
  sessionHeader: 'x-google-adk-session-id',
  userHeader: 'x-google-adk-user-id',
} as const;

export interface GoogleAdkProviderConfig extends GoogleApiKeyConfig {
  enabled?: boolean;
  appName?: string;
  model?: string;
  instruction?: string;
  agentName?: string;
  enableGoogleSearch?: boolean;
  enableCodeExecution?: boolean;
  maxWaitMs?: number;
}

interface RunnerEntry {
  runner: InMemoryRunner;
  apiKey: string;
}

const runnerByKey = new Map<string, RunnerEntry>();

function runnerCacheKey(apiKey: string, config?: GoogleAdkProviderConfig): string {
  return [
    apiKey.slice(-8),
    config?.appName ?? GOOGLE_ADK_DEFAULTS.appName,
    config?.model ?? GOOGLE_ADK_DEFAULTS.defaultModel,
    config?.agentName ?? 'relayplane_agent',
    config?.enableGoogleSearch === false ? 'no-search' : 'search',
    config?.enableCodeExecution === false ? 'no-code' : 'code',
  ].join(':');
}

function buildLlmAgent(config?: GoogleAdkProviderConfig): LlmAgent {
  const tools = [];
  if (config?.enableGoogleSearch !== false) {
    tools.push(GOOGLE_SEARCH);
  }

  return new LlmAgent({
    name: config?.agentName ?? 'relayplane_agent',
    model: config?.model ?? GOOGLE_ADK_DEFAULTS.defaultModel,
    description: 'Trestle ADK agent',
    instruction:
      config?.instruction ??
      'You are a capable AI assistant. Use tools when they help answer the user accurately.',
    ...(tools.length > 0 ? { tools } : {}),
    ...(config?.enableCodeExecution !== false
      ? { codeExecutor: new BuiltInCodeExecutor() }
      : {}),
  });
}

export function getGoogleAdkRunner(
  apiKey: string,
  config?: GoogleAdkProviderConfig
): InMemoryRunner {
  const key = runnerCacheKey(apiKey, config);
  const existing = runnerByKey.get(key);
  if (existing) {
    return existing.runner;
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    process.env.GEMINI_API_KEY = apiKey;
  }

  const agent = buildLlmAgent(config);
  const runner = new InMemoryRunner({
    agent,
    appName: config?.appName ?? GOOGLE_ADK_DEFAULTS.appName,
  });
  runnerByKey.set(key, { runner, apiKey });
  return runner;
}

export function adkPing(): { ok: true; adkVersion: string } {
  return { ok: true, adkVersion };
}

export async function adkCreateSession(
  apiKey: string,
  userId: string,
  config?: GoogleAdkProviderConfig,
  sessionId?: string
) {
  const runner = getGoogleAdkRunner(apiKey, config);
  const appName = config?.appName ?? GOOGLE_ADK_DEFAULTS.appName;
  return runner.sessionService.createSession({
    appName,
    userId,
    ...(sessionId ? { sessionId } : {}),
  });
}

export async function adkListSessions(
  apiKey: string,
  userId: string,
  config?: GoogleAdkProviderConfig
) {
  const runner = getGoogleAdkRunner(apiKey, config);
  const appName = config?.appName ?? GOOGLE_ADK_DEFAULTS.appName;
  return runner.sessionService.listSessions({ appName, userId });
}

export async function adkGetSession(
  apiKey: string,
  userId: string,
  sessionId: string,
  config?: GoogleAdkProviderConfig
) {
  const runner = getGoogleAdkRunner(apiKey, config);
  const appName = config?.appName ?? GOOGLE_ADK_DEFAULTS.appName;
  return runner.sessionService.getSession({ appName, userId, sessionId });
}

export async function adkDeleteSession(
  apiKey: string,
  userId: string,
  sessionId: string,
  config?: GoogleAdkProviderConfig
) {
  const runner = getGoogleAdkRunner(apiKey, config);
  const appName = config?.appName ?? GOOGLE_ADK_DEFAULTS.appName;
  await runner.sessionService.deleteSession({ appName, userId, sessionId });
  return { deleted: true, sessionId };
}

function messagesToContent(messages: ChatRequestBody['messages']): Content {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text =
    typeof lastUser?.content === 'string'
      ? lastUser.content
      : messages
          .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
          .join('\n');
  return { role: 'user', parts: [{ text }] };
}

function eventsToOpenAiCompletion(
  events: Event[],
  model: string,
  sessionId?: string
): Record<string, unknown> {
  const text = events
    .filter((e) => isFinalResponse(e))
    .map((e) => stringifyContent(e))
    .filter(Boolean)
    .join('\n');

  return {
    id: `adk-${sessionId ?? 'ephemeral'}`,
    object: 'chat.completion',
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

export async function adkRunSession(
  apiKey: string,
  userId: string,
  sessionId: string,
  message: Content | string,
  config?: GoogleAdkProviderConfig
): Promise<{ events: Event[]; response: Record<string, unknown> }> {
  const runner = getGoogleAdkRunner(apiKey, config);
  const newMessage: Content =
    typeof message === 'string' ? { role: 'user', parts: [{ text: message }] } : message;

  const events: Event[] = [];
  for await (const event of runner.runAsync({ userId, sessionId, newMessage })) {
    events.push(event);
  }

  const model = config?.model ?? GOOGLE_ADK_DEFAULTS.defaultModel;
  return {
    events,
    response: eventsToOpenAiCompletion(events, model, sessionId),
  };
}

export async function adkRunEphemeral(
  apiKey: string,
  userId: string,
  message: Content | string,
  config?: GoogleAdkProviderConfig
): Promise<{ events: Event[]; response: Record<string, unknown> }> {
  const runner = getGoogleAdkRunner(apiKey, config);
  const newMessage: Content =
    typeof message === 'string' ? { role: 'user', parts: [{ text: message }] } : message;

  const events: Event[] = [];
  for await (const event of runner.runEphemeral({ userId, newMessage })) {
    events.push(event);
  }

  const model = config?.model ?? GOOGLE_ADK_DEFAULTS.defaultModel;
  return { events, response: eventsToOpenAiCompletion(events, model) };
}

export async function* adkRunSessionStream(
  apiKey: string,
  userId: string,
  sessionId: string,
  message: Content | string,
  config?: GoogleAdkProviderConfig
): AsyncGenerator<Event, void, undefined> {
  const runner = getGoogleAdkRunner(apiKey, config);
  const newMessage: Content =
    typeof message === 'string' ? { role: 'user', parts: [{ text: message }] } : message;
  yield* runner.runAsync({ userId, sessionId, newMessage });
}

export async function forwardToGoogleAdkChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: GoogleAdkProviderConfig,
  sessionId?: string,
  userId?: string
): Promise<{ success: true; data: Record<string, unknown>; sessionId?: string } | { success: false; error: ReturnType<typeof mapGoogleError> }> {
  try {
    const uid = userId ?? GOOGLE_ADK_DEFAULTS.defaultUserId;
    const adkConfig = { ...config, model: stripModelPrefix(targetModel, 'google-adk') || config?.model };

    if (sessionId) {
      const result = await adkRunSession(apiKey, uid, sessionId, messagesToContent(request.messages), adkConfig);
      return { success: true, data: result.response, sessionId };
    }

    const session = await adkCreateSession(apiKey, uid, adkConfig);
    const result = await adkRunSession(apiKey, uid, session.id, messagesToContent(request.messages), adkConfig);
    return { success: true, data: result.response, sessionId: session.id };
  } catch (err) {
    return { success: false, error: mapGoogleError(err) };
  }
}

export async function forwardToGoogleAdkChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: GoogleAdkProviderConfig,
  sessionId?: string,
  userId?: string
): Promise<
  | { success: true; stream: AsyncGenerator<string, void, undefined>; sessionId?: string }
  | { success: false; error: ReturnType<typeof mapGoogleError> }
> {
  try {
    const uid = userId ?? GOOGLE_ADK_DEFAULTS.defaultUserId;
    const adkConfig = { ...config, model: stripModelPrefix(targetModel, 'google-adk') || config?.model };
    let activeSessionId = sessionId;

    if (!activeSessionId) {
      const session = await adkCreateSession(apiKey, uid, adkConfig);
      activeSessionId = session.id;
    }

    const eventStream = adkRunSessionStream(
      apiKey,
      uid,
      activeSessionId,
      messagesToContent(request.messages),
      adkConfig
    );

    async function* toSse(): AsyncGenerator<string, void, undefined> {
      for await (const event of eventStream) {
        const chunk = stringifyContent(event);
        if (!chunk) {
          continue;
        }
        const payload = {
          id: `adk-${activeSessionId}`,
          object: 'chat.completion.chunk',
          model: adkConfig.model ?? GOOGLE_ADK_DEFAULTS.defaultModel,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
        };
        yield `data: ${JSON.stringify(payload)}\n\n`;
        if (isFinalResponse(event)) {
          yield 'data: [DONE]\n\n';
        }
      }
    }

    return { success: true, stream: toSse(), sessionId: activeSessionId };
  } catch (err) {
    return { success: false, error: mapGoogleError(err) };
  }
}

function stripModelPrefix(model: string, prefix: string): string {
  const p = `${prefix}/`;
  return model.startsWith(p) ? model.slice(p.length) : model;
}

export function mapGoogleAdkError(err: unknown) {
  return mapGoogleError(err, 'Google ADK error — verify GEMINI_API_KEY and agent config');
}
