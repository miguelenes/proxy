/**
 * DeepSeek provider — dedicated forwarding with prefix completion, thinking mode,
 * KV-cache usage mapping, balance/models clients, and error normalization.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import { getProviderEndpoint } from './registry.js';
import type { ChatRequestBody } from './shared.js';

export const DEEPSEEK_DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  betaBaseUrl: 'https://api.deepseek.com/beta',
  anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
} as const;

/** Canonical models (post-deprecation) */
export const DEEPSEEK_MODELS = {
  flash: 'deepseek-v4-flash',
  pro: 'deepseek-v4-pro',
} as const;

/** Legacy aliases (deprecated 2026-07-24) */
export const DEEPSEEK_LEGACY_ALIASES: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
};

export function resolveDeepSeekModel(model: string): string {
  return DEEPSEEK_LEGACY_ALIASES[model] ?? model;
}

export function isPrefixCompletion(
  messages: Array<{ role?: string; prefix?: boolean }>
): boolean {
  const last = messages[messages.length - 1];
  return last?.role === 'assistant' && last?.prefix === true;
}

export function isThinkingModel(model: string): boolean {
  const resolved = resolveDeepSeekModel(model);
  return /v4-pro|reasoner/.test(resolved);
}

export interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface NormalizedDeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens: number;
  prompt_cache_miss_tokens: number;
}

export function mapDeepSeekUsage(u: DeepSeekUsage): NormalizedDeepSeekUsage {
  const hit = u.prompt_cache_hit_tokens ?? 0;
  const miss = u.prompt_cache_miss_tokens ?? Math.max(0, u.prompt_tokens - hit);
  return {
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    total_tokens: u.total_tokens,
    prompt_cache_hit_tokens: hit,
    prompt_cache_miss_tokens: miss,
  };
}

export interface DeepSeekForwardOptions {
  providersConfig?: ProvidersConfigMap;
  stream?: boolean;
}

function resolveBaseUrl(providersConfig?: ProvidersConfigMap): string {
  const endpoint = getProviderEndpoint('deepseek', providersConfig);
  return (endpoint.baseUrl || DEEPSEEK_DEFAULTS.baseUrl).replace(/\/$/, '');
}

function buildDeepSeekChatUrl(
  request: ChatRequestBody,
  providersConfig?: ProvidersConfigMap
): string {
  const base = resolveBaseUrl(providersConfig);
  if (isPrefixCompletion(request.messages)) {
    return `${DEEPSEEK_DEFAULTS.betaBaseUrl}/chat/completions`;
  }
  return `${base}/chat/completions`;
}

function buildDeepSeekBody(
  request: ChatRequestBody,
  targetModel: string,
  stream: boolean
): Record<string, unknown> {
  const resolvedModel = resolveDeepSeekModel(targetModel);
  const body: Record<string, unknown> = {
    ...request,
    model: resolvedModel,
    stream,
  };

  // Thinking mode: preserve extra_body.thinking / reasoning_effort for pro models only.
  // Flash models: leave request unchanged (DeepSeek default applies).
  return body;
}

async function parseErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

export function mapDeepSeekError(
  status: number,
  body: unknown
): { error: string; hint: string } {
  const message =
    typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : typeof body === 'string'
          ? body
          : `DeepSeek API error (${status})`;

  const hints: Record<number, string> = {
    400: 'Invalid request body — check the schema',
    401: 'Authentication failed — verify DEEPSEEK_API_KEY',
    402: 'Insufficient balance — top up at platform.deepseek.com',
    422: 'Invalid parameters',
    429: 'Rate limited — back off and retry',
    500: 'Server error — retry after a brief wait',
    503: 'Server error — retry after a brief wait',
  };

  return {
    error: message,
    hint: hints[status] ?? 'Unexpected DeepSeek API error',
  };
}

async function wrapDeepSeekError(response: Response): Promise<Response> {
  const body = await parseErrorBody(response);
  const mapped = mapDeepSeekError(response.status, body);
  const hasParseableShape =
    body !== null &&
    (typeof body === 'object' || (typeof body === 'string' && body.length > 0));

  if (!hasParseableShape) {
    return response;
  }

  return new Response(JSON.stringify(mapped), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function forwardToDeepSeek(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: DeepSeekForwardOptions = {}
): Promise<Response> {
  const url = buildDeepSeekChatUrl(request, opts.providersConfig);
  const body = buildDeepSeekBody(request, targetModel, false);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapDeepSeekError(response);
  }

  return response;
}

export async function forwardToDeepSeekStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: DeepSeekForwardOptions = {}
): Promise<Response> {
  const url = buildDeepSeekChatUrl(request, opts.providersConfig);
  const body = buildDeepSeekBody(request, targetModel, true);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapDeepSeekError(response);
  }

  return response;
}

export async function getDeepSeekBalance(apiKey: string): Promise<Response> {
  const url = `${DEEPSEEK_DEFAULTS.baseUrl}/user/balance`;
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
}

export async function listDeepSeekModels(apiKey: string): Promise<Response> {
  const url = `${DEEPSEEK_DEFAULTS.baseUrl}/models`;
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
}

// TODO: Anthropic-format forwarding via DEEPSEEK_DEFAULTS.anthropicBaseUrl — out of scope for now.
// See https://api-docs.deepseek.com/
