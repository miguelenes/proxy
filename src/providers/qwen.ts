/**
 * Qwen / DashScope cloud provider — OpenAI-compatible chat + models API.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import type { ChatRequestBody } from './shared.js';

export const QWEN_DEFAULTS = {
  internationalBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  chinaBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  usBaseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
  hongkongBaseUrl: 'https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1',
  apiKeyEnv: 'DASHSCOPE_API_KEY',
  timeoutMs: 120_000,
} as const;

export type QwenRegion = 'international' | 'china' | 'us' | 'hongkong';

export interface QwenProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  region?: QwenRegion;
  apiKeyEnv?: string;
  timeoutMs?: number;
  enableThinking?: boolean;
}

export interface QwenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  cached_tokens?: number;
}

export interface NormalizedQwenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
}

const REGION_BASE_URLS: Record<QwenRegion, string> = {
  international: QWEN_DEFAULTS.internationalBaseUrl,
  china: QWEN_DEFAULTS.chinaBaseUrl,
  us: QWEN_DEFAULTS.usBaseUrl,
  hongkong: QWEN_DEFAULTS.hongkongBaseUrl,
};

export function resolveQwenApiKey(config?: QwenProviderConfig): string | null {
  const envName = config?.apiKeyEnv ?? QWEN_DEFAULTS.apiKeyEnv;
  const key = process.env[envName];
  return key?.trim() ? key.trim() : null;
}

export function resolveQwenApiKeyFromBearer(bearer: string | null | undefined): string | null {
  if (!bearer?.trim()) {
    return null;
  }
  return bearer.trim();
}

export function resolveQwenBaseUrl(
  config?: QwenProviderConfig,
  providersConfig?: ProvidersConfigMap
): string {
  const fromProviders = providersConfig?.['qwen'] as QwenProviderConfig | undefined;
  const explicitBaseUrl =
    config?.baseUrl?.trim() ||
    fromProviders?.baseUrl?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/$/, '');
  }
  const region = config?.region ?? fromProviders?.region ?? 'international';
  return REGION_BASE_URLS[region];
}

export function isQwenThinkingModel(model: string): boolean {
  const name = model.replace(/^qwen\//i, '').toLowerCase();
  return name.includes('qwen3') || name.includes('-thinking');
}

export function applyQwenThinkingDefaults(
  body: Record<string, unknown>,
  targetModel: string,
  config?: QwenProviderConfig,
  stream?: boolean
): Record<string, unknown> {
  const result = { ...body };
  if (stream) {
    return result;
  }
  if (!isQwenThinkingModel(targetModel)) {
    return result;
  }
  if ('enable_thinking' in result) {
    return result;
  }
  const enableThinking = config?.enableThinking ?? false;
  result['enable_thinking'] = enableThinking;
  return result;
}

function stripModelPrefix(model: string): string {
  return model.startsWith('qwen/') ? model.slice('qwen/'.length) : model;
}

async function qwenFetch(
  apiKey: string,
  path: string,
  config?: QwenProviderConfig,
  providersConfig?: ProvidersConfigMap,
  init?: RequestInit
): Promise<Response> {
  const base = resolveQwenBaseUrl(config, providersConfig);
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const timeout = config?.timeoutMs ?? QWEN_DEFAULTS.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function mapQwenUsage(usage?: QwenUsage): NormalizedQwenUsage {
  const prompt = usage?.prompt_tokens ?? 0;
  const completion = usage?.completion_tokens ?? 0;
  const cached =
    usage?.cached_tokens ??
    usage?.prompt_tokens_details?.cached_tokens ??
    0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage?.total_tokens ?? prompt + completion,
    cached_tokens: cached,
  };
}

export function mapQwenError(
  status: number,
  body?: unknown
): { error: string; hint: string; status: number } {
  const message =
    typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : typeof body === 'string'
          ? body
          : `DashScope API error (${status})`;

  const hints: Record<number, string> = {
    400: 'Invalid request — check model and messages schema',
    401: 'Authentication failed — verify DASHSCOPE_API_KEY at dashscope.console.aliyun.com',
    403: 'Forbidden — check API key region matches providers.qwen.region',
    429: 'Rate limited — back off and retry',
    500: 'DashScope server error — retry after a brief wait',
    503: 'DashScope server error — retry after a brief wait',
  };

  return {
    error: message,
    hint: hints[status] ?? 'Unexpected DashScope / Qwen API error',
    status,
  };
}

async function wrapQwenError(response: Response): Promise<Response> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return response;
  }
  const mapped = mapQwenError(response.status, body);
  return new Response(JSON.stringify(mapped), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function forwardToQwenChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: QwenProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  const stripped = stripModelPrefix(targetModel);
  const body = applyQwenThinkingDefaults(
    { ...request, model: stripped, stream: false },
    stripped,
    config,
    false
  );
  const response = await qwenFetch(apiKey, '/chat/completions', config, providersConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return wrapQwenError(response);
  }
  return response;
}

export async function forwardToQwenChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: QwenProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  const stripped = stripModelPrefix(targetModel);
  const body = applyQwenThinkingDefaults(
    { ...request, model: stripped, stream: true },
    stripped,
    config,
    true
  );
  const response = await qwenFetch(apiKey, '/chat/completions', config, providersConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return wrapQwenError(response);
  }
  return response;
}

export async function qwenListModels(
  apiKey: string,
  config?: QwenProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return qwenFetch(apiKey, '/models', config, providersConfig, { method: 'GET' });
}

export async function qwenPing(
  apiKey: string,
  config?: QwenProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<{ ok: true; baseUrl: string }> {
  const response = await qwenListModels(apiKey, config, providersConfig);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const mapped = mapQwenError(response.status, body);
    throw new Error(mapped.error);
  }
  return { ok: true, baseUrl: resolveQwenBaseUrl(config, providersConfig) };
}
