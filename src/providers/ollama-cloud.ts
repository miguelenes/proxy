/**
 * Ollama Cloud provider — dedicated chat forwarding (OpenAI-compat path),
 * native /api/* clients, Anthropic-compat messages, usage mapping, and errors.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import { getProviderEndpoint } from './registry.js';
import type { ChatRequestBody } from './shared.js';

export const OLLAMA_CLOUD_DEFAULTS = {
  baseUrl: 'https://ollama.com',
  nativePath: '/api',
  openaiPath: '/v1',
  anthropicPath: '/v1',
  apiKeyEnv: 'OLLAMA_API_KEY',
} as const;

export const OLLAMA_CLOUD_MODELS = {
  chat: [
    'gpt-oss:20b',
    'gpt-oss:120b',
    'deepseek-v3.1:671b',
    'qwen3-coder:480b',
    'kimi-k2:1t',
    'glm-4.6:cloud',
    'qwen3-vl:235b',
    'minimax-m2:230b',
  ],
  embed: ['embeddinggemma', 'nomic-embed-text', 'mxbai-embed-large'],
} as const;

const ALL_CLOUD_MODELS = new Set<string>([
  ...OLLAMA_CLOUD_MODELS.chat,
  ...OLLAMA_CLOUD_MODELS.embed,
]);

export function stripCloudSuffix(model: string): string {
  if (model.endsWith(':cloud')) {
    return model.slice(0, -':cloud'.length);
  }
  if (model.endsWith('-cloud')) {
    return model.slice(0, -'-cloud'.length);
  }
  return model;
}

export function isOllamaCloudModel(model: string): boolean {
  const stripped = stripCloudSuffix(model);
  if (ALL_CLOUD_MODELS.has(model) || ALL_CLOUD_MODELS.has(stripped)) {
    return true;
  }
  if (model.endsWith(':cloud') || model.endsWith('-cloud')) {
    return true;
  }
  if (model.endsWith(':cloud') === false && model.includes(':cloud')) {
    return true;
  }
  return false;
}

export function supportsThink(model: string): boolean {
  const m = stripCloudSuffix(model).toLowerCase();
  if (m.startsWith('gpt-oss')) {
    return true;
  }
  if (m.startsWith('glm-4.6')) {
    return true;
  }
  if (m.startsWith('qwen3')) {
    return true;
  }
  return false;
}

export interface OllamaUsage {
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

export interface NormalizedOllamaUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_duration_ns: number;
}

export function mapOllamaUsage(u: OllamaUsage): NormalizedOllamaUsage {
  const input = u.prompt_eval_count ?? 0;
  const output = u.eval_count ?? 0;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    total_duration_ns: u.total_duration ?? 0,
  };
}

export interface OllamaCloudForwardOptions {
  providersConfig?: ProvidersConfigMap;
}

function resolveOpenAiBaseUrl(providersConfig?: ProvidersConfigMap): string {
  const endpoint = getProviderEndpoint('ollama-cloud', providersConfig);
  const base = (endpoint.baseUrl || `${OLLAMA_CLOUD_DEFAULTS.baseUrl}${OLLAMA_CLOUD_DEFAULTS.openaiPath}`).replace(
    /\/$/,
    ''
  );
  return base;
}

function resolveNativeBaseUrl(): string {
  return `${OLLAMA_CLOUD_DEFAULTS.baseUrl}${OLLAMA_CLOUD_DEFAULTS.nativePath}`;
}

export function buildOllamaCloudOpenAiUrl(path: string, providersConfig?: ProvidersConfigMap): string {
  const base = resolveOpenAiBaseUrl(providersConfig);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function buildOllamaCloudNativeUrl(path: string): string {
  const base = resolveNativeBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function ollamaCloudAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
}

function buildOllamaCloudChatBody(
  request: ChatRequestBody,
  targetModel: string,
  stream: boolean
): Record<string, unknown> {
  return {
    ...request,
    model: targetModel,
    stream,
  };
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

export function mapOllamaCloudError(
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
          : `Ollama Cloud API error (${status})`;

  const hints: Record<number, string> = {
    400: 'Invalid request — check parameters and JSON shape',
    401: 'Authentication failed — verify OLLAMA_API_KEY',
    404: 'Model not found — pull or check the model name',
    429: 'Rate limited — back off and retry',
    500: 'Server error — retry after a brief wait',
    502: 'Cloud model unreachable — try again or pick another model',
  };

  return {
    error: message,
    hint: hints[status] ?? 'Unexpected Ollama Cloud API error',
  };
}

async function wrapOllamaCloudError(response: Response): Promise<Response> {
  const body = await parseErrorBody(response);
  const mapped = mapOllamaCloudError(response.status, body);
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

export async function ollamaCloudJsonRequest(
  method: 'GET' | 'POST',
  url: string,
  apiKey: string,
  body?: unknown
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      ...ollamaCloudAuthHeaders(apiKey),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  return fetch(url, init);
}

export async function forwardToOllamaCloudChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: OllamaCloudForwardOptions = {}
): Promise<Response> {
  const url = buildOllamaCloudOpenAiUrl('/chat/completions', opts.providersConfig);
  const body = buildOllamaCloudChatBody(request, targetModel, false);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...ollamaCloudAuthHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }

  return response;
}

export async function forwardToOllamaCloudChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: OllamaCloudForwardOptions = {}
): Promise<Response> {
  const url = buildOllamaCloudOpenAiUrl('/chat/completions', opts.providersConfig);
  const body = buildOllamaCloudChatBody(request, targetModel, true);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...ollamaCloudAuthHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }

  return response;
}

export async function ollamaCloudGenerate(
  body: unknown,
  apiKey: string,
  _opts: OllamaCloudForwardOptions = {}
): Promise<Response> {
  const url = buildOllamaCloudNativeUrl('/generate');
  const response = await ollamaCloudJsonRequest('POST', url, apiKey, body);
  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }
  return response;
}

export async function ollamaCloudEmbed(
  body: unknown,
  apiKey: string,
  _opts: OllamaCloudForwardOptions = {}
): Promise<Response> {
  const url = buildOllamaCloudNativeUrl('/embed');
  const response = await ollamaCloudJsonRequest('POST', url, apiKey, body);
  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }
  return response;
}

export async function ollamaCloudListModels(apiKey: string): Promise<Response> {
  const url = buildOllamaCloudNativeUrl('/tags');
  const response = await ollamaCloudJsonRequest('GET', url, apiKey);
  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }
  return response;
}

export async function ollamaCloudListRunning(apiKey: string): Promise<Response> {
  const url = buildOllamaCloudNativeUrl('/ps');
  const response = await ollamaCloudJsonRequest('GET', url, apiKey);
  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }
  return response;
}

export async function ollamaCloudShowModel(
  body: unknown,
  apiKey: string,
  _opts: OllamaCloudForwardOptions = {}
): Promise<Response> {
  const url = buildOllamaCloudNativeUrl('/show');
  const response = await ollamaCloudJsonRequest('POST', url, apiKey, body);
  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }
  return response;
}

export async function ollamaCloudVersion(apiKey: string): Promise<Response> {
  const url = buildOllamaCloudNativeUrl('/version');
  const response = await ollamaCloudJsonRequest('GET', url, apiKey);
  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }
  return response;
}

export async function ollamaCloudAnthropicMessages(
  body: unknown,
  apiKey: string,
  opts: OllamaCloudForwardOptions = {}
): Promise<Response> {
  const url = buildOllamaCloudOpenAiUrl('/messages', opts.providersConfig);
  const response = await ollamaCloudJsonRequest('POST', url, apiKey, body);
  if (!response.ok) {
    return wrapOllamaCloudError(response);
  }
  return response;
}
