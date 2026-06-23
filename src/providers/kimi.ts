/**
 * Kimi / Moonshot cloud provider — OpenAI-compatible chat + balance/models/token/files APIs.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import type { ChatRequestBody } from './shared.js';

export const KIMI_DEFAULTS = {
  internationalBaseUrl: 'https://api.moonshot.ai/v1',
  chinaBaseUrl: 'https://api.moonshot.cn/v1',
  apiKeyEnv: 'MOONSHOT_API_KEY',
  fallbackApiKeyEnv: 'KIMI_API_KEY',
  timeoutMs: 120_000,
} as const;

export type KimiRegion = 'international' | 'china';

export interface KimiProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  region?: KimiRegion;
  apiKeyEnv?: string;
  timeoutMs?: number;
}

export interface KimiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cached_tokens?: number;
}

export interface NormalizedKimiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
}

export function resolveKimiApiKey(config?: KimiProviderConfig): string | null {
  const primaryEnv = config?.apiKeyEnv ?? KIMI_DEFAULTS.apiKeyEnv;
  const primary = process.env[primaryEnv];
  if (primary?.trim()) {
    return primary.trim();
  }
  const fallback = process.env[KIMI_DEFAULTS.fallbackApiKeyEnv];
  return fallback?.trim() ? fallback.trim() : null;
}

export function resolveKimiApiKeyFromBearer(bearer: string | null | undefined): string | null {
  if (!bearer?.trim()) {
    return null;
  }
  return bearer.trim();
}

export function resolveKimiBaseUrl(
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): string {
  const fromProviders = providersConfig?.['kimi'] as KimiProviderConfig | undefined;
  const explicitBaseUrl =
    config?.baseUrl?.trim() ||
    fromProviders?.baseUrl?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/$/, '');
  }
  const region = config?.region ?? fromProviders?.region ?? 'international';
  return region === 'china'
    ? KIMI_DEFAULTS.chinaBaseUrl
    : KIMI_DEFAULTS.internationalBaseUrl;
}

function stripModelPrefix(model: string): string {
  return model.startsWith('kimi/') ? model.slice('kimi/'.length) : model;
}

async function kimiFetch(
  apiKey: string,
  path: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap,
  init?: RequestInit
): Promise<Response> {
  const base = resolveKimiBaseUrl(config, providersConfig);
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const timeout = config?.timeoutMs ?? KIMI_DEFAULTS.timeoutMs;
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

export function mapKimiUsage(usage?: KimiUsage): NormalizedKimiUsage {
  const prompt = usage?.prompt_tokens ?? 0;
  const completion = usage?.completion_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage?.total_tokens ?? prompt + completion,
    cached_tokens: usage?.cached_tokens ?? 0,
  };
}

export function mapKimiError(
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
          : `Kimi API error (${status})`;

  const hints: Record<number, string> = {
    400: 'Invalid request — check model and messages schema',
    401: 'Authentication failed — verify MOONSHOT_API_KEY at platform.moonshot.ai',
    402: 'Insufficient balance — top up at platform.moonshot.ai',
    422: 'Invalid parameters',
    429: 'Rate limited — back off and retry',
    500: 'Moonshot server error — retry after a brief wait',
    503: 'Moonshot server error — retry after a brief wait',
  };

  return {
    error: message,
    hint: hints[status] ?? 'Unexpected Kimi / Moonshot API error',
    status,
  };
}

async function wrapKimiError(response: Response): Promise<Response> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return response;
  }
  const mapped = mapKimiError(response.status, body);
  return new Response(JSON.stringify(mapped), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function forwardToKimiChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  const body = { ...request, model: stripModelPrefix(targetModel), stream: false };
  const response = await kimiFetch(apiKey, '/chat/completions', config, providersConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return wrapKimiError(response);
  }
  return response;
}

export async function forwardToKimiChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  const body = { ...request, model: stripModelPrefix(targetModel), stream: true };
  const response = await kimiFetch(apiKey, '/chat/completions', config, providersConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return wrapKimiError(response);
  }
  return response;
}

export async function kimiGetBalance(
  apiKey: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return kimiFetch(apiKey, '/users/me/balance', config, providersConfig, { method: 'GET' });
}

export async function kimiListModels(
  apiKey: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return kimiFetch(apiKey, '/models', config, providersConfig, { method: 'GET' });
}

export async function kimiEstimateTokens(
  apiKey: string,
  body: Record<string, unknown>,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return kimiFetch(apiKey, '/tokenizers/estimate-token-count', config, providersConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function kimiUploadFile(
  apiKey: string,
  body: Buffer,
  contentType: string | undefined,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  const base = resolveKimiBaseUrl(config, providersConfig);
  const timeout = config?.timeoutMs ?? KIMI_DEFAULTS.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(`${base}/files`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body: new Uint8Array(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function kimiListFiles(
  apiKey: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return kimiFetch(apiKey, '/files', config, providersConfig, { method: 'GET' });
}

export async function kimiGetFile(
  apiKey: string,
  fileId: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return kimiFetch(apiKey, `/files/${encodeURIComponent(fileId)}`, config, providersConfig, {
    method: 'GET',
  });
}

export async function kimiDeleteFile(
  apiKey: string,
  fileId: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return kimiFetch(apiKey, `/files/${encodeURIComponent(fileId)}`, config, providersConfig, {
    method: 'DELETE',
  });
}

export async function kimiGetFileContent(
  apiKey: string,
  fileId: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return kimiFetch(
    apiKey,
    `/files/${encodeURIComponent(fileId)}/content`,
    config,
    providersConfig,
    { method: 'GET' }
  );
}

export async function kimiPing(
  apiKey: string,
  config?: KimiProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<{ ok: true; baseUrl: string }> {
  const response = await kimiListModels(apiKey, config, providersConfig);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const mapped = mapKimiError(response.status, body);
    throw new Error(mapped.error);
  }
  return { ok: true, baseUrl: resolveKimiBaseUrl(config, providersConfig) };
}
