/**
 * OpenCode Zen cloud provider — multi-protocol forwarding to opencode.ai/zen/v1.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import type { ChatRequestBody } from './shared.js';
import {
  type OpencodeApiProtocol,
  type OpencodeTier,
  OPENCODE_ZEN_DEFAULTS,
  buildOpencodeUpstreamUrl,
  mapOpencodeError,
  mapOpencodeUsage,
  resolveOpencodeProtocol,
  resolveOpencodeZenToken,
  resolveOpencodeTokenFromBearer,
  type NormalizedOpencodeUsage,
} from './opencode-routing.js';

export {
  OPENCODE_ZEN_DEFAULTS,
  mapOpencodeError,
  mapOpencodeUsage,
  parseOpencodeModelName,
  resolveOpencodeProtocol,
  buildOpencodeUpstreamUrl,
  resolveOpencodeZenToken,
  resolveOpencodeTokenFromBearer,
  type NormalizedOpencodeUsage,
  type OpencodeApiProtocol,
} from './opencode-routing.js';

export interface OpencodeZenProviderConfig {
  enabled?: boolean;
  apiKeyEnv?: string;
  baseUrl?: string;
}

export interface OpencodeForwardOptions {
  providersConfig?: ProvidersConfigMap;
  tier?: OpencodeTier;
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function extractSystemFromChat(
  messages: Array<{ role: string; content: string | unknown }>
): { system?: string; messages: Array<{ role: string; content: string | unknown }> } {
  const systemParts: string[] = [];
  const rest: Array<{ role: string; content: string | unknown }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      systemParts.push(text);
    } else {
      rest.push(msg);
    }
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
    messages: rest,
  };
}

function chatToAnthropicBody(
  request: ChatRequestBody,
  modelId: string,
  stream: boolean
): Record<string, unknown> {
  const { system, messages } = extractSystemFromChat(request.messages);
  const anthropicMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content:
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
          : String(m.content ?? ''),
  }));

  const body: Record<string, unknown> = {
    model: modelId,
    messages: anthropicMessages,
    stream,
    max_tokens: request.max_tokens ?? 4096,
  };

  if (system) {
    body['system'] = system;
  }
  if (request.tools) {
    body['tools'] = request.tools;
  }
  if (request.tool_choice !== undefined) {
    body['tool_choice'] = request.tool_choice;
  }
  if (request.temperature !== undefined) {
    body['temperature'] = request.temperature;
  }

  return body;
}

function chatToResponsesBody(
  request: ChatRequestBody,
  modelId: string,
  stream: boolean
): Record<string, unknown> {
  const input = request.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return {
    model: modelId,
    input,
    stream,
    ...(request.max_tokens != null ? { max_output_tokens: request.max_tokens } : {}),
    ...(request.temperature != null ? { temperature: request.temperature } : {}),
    ...(request.tools ? { tools: request.tools } : {}),
  };
}

function chatToGeminiBody(
  request: ChatRequestBody,
  modelId: string
): Record<string, unknown> {
  const { system, messages } = extractSystemFromChat(request.messages);
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      {
        text:
          typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? JSON.stringify(m.content)
              : String(m.content ?? ''),
      },
    ],
  }));

  const body: Record<string, unknown> = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(request.max_tokens != null
      ? { generationConfig: { maxOutputTokens: request.max_tokens } }
      : {}),
  };

  return body;
}

function buildUpstreamBody(
  protocol: OpencodeApiProtocol,
  request: ChatRequestBody,
  modelId: string,
  stream: boolean
): Record<string, unknown> {
  switch (protocol) {
    case 'anthropic':
      return chatToAnthropicBody(request, modelId, stream);
    case 'responses':
      return chatToResponsesBody(request, modelId, stream);
    case 'gemini':
      return chatToGeminiBody(request, modelId);
    case 'chat':
    default:
      return { ...request, model: modelId, stream };
  }
}

async function forwardOpencodeCloud(
  tier: OpencodeTier,
  request: ChatRequestBody,
  modelId: string,
  apiKey: string,
  stream: boolean,
  options?: OpencodeForwardOptions
): Promise<Response> {
  const protocol = resolveOpencodeProtocol(tier, modelId);
  const url = buildOpencodeUpstreamUrl(tier, protocol, modelId, stream, options?.providersConfig);
  const body = buildUpstreamBody(protocol, request, modelId, stream);

  return fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

export async function forwardToOpencodeZenChat(
  request: ChatRequestBody,
  modelId: string,
  apiKey: string,
  options?: OpencodeForwardOptions
): Promise<Response> {
  return forwardOpencodeCloud('zen', request, modelId, apiKey, false, options);
}

export async function forwardToOpencodeZenChatStream(
  request: ChatRequestBody,
  modelId: string,
  apiKey: string,
  options?: OpencodeForwardOptions
): Promise<Response> {
  return forwardOpencodeCloud('zen', request, modelId, apiKey, true, options);
}

export async function forwardToOpencodeZenMessages(
  body: Record<string, unknown>,
  modelId: string,
  apiKey: string,
  stream: boolean,
  options?: OpencodeForwardOptions
): Promise<Response> {
  const tier: OpencodeTier = options?.tier ?? 'zen';
  const url = buildOpencodeUpstreamUrl(tier, 'anthropic', modelId, stream, options?.providersConfig);
  const payload = { ...body, model: modelId, stream };
  return fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: JSON.stringify(payload),
  });
}

export async function forwardToOpencodeZenResponses(
  body: Record<string, unknown>,
  modelId: string,
  apiKey: string,
  stream: boolean,
  options?: OpencodeForwardOptions
): Promise<Response> {
  const tier: OpencodeTier = options?.tier ?? 'zen';
  const url = buildOpencodeUpstreamUrl(tier, 'responses', modelId, stream, options?.providersConfig);
  const payload = { ...body, model: modelId, stream };
  return fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: JSON.stringify(payload),
  });
}

export async function listOpencodeZenModels(
  apiKey?: string | null,
  options?: OpencodeForwardOptions
): Promise<unknown> {
  const tier: OpencodeTier = options?.tier ?? 'zen';
  const base = buildOpencodeUpstreamUrl(tier, 'chat', '', false, options?.providersConfig).replace(
    '/chat/completions',
    ''
  );
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }
  const response = await fetch(`${base}/models`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenCode models list failed (${response.status}): ${text}`);
  }
  return response.json();
}

export function mapOpencodeZenError(err: unknown) {
  return mapOpencodeError(err, 'zen');
}

export function mapOpencodeZenUsage(usage: Record<string, unknown> | undefined) {
  return mapOpencodeUsage(usage);
}
