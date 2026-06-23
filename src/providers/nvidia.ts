/**
 * NVIDIA NIM provider — dedicated OpenAI-compat chat forwarding with Nemotron
 * reasoning passthrough, embeddings, reranking, models list, usage mapping, and errors.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import { getProviderEndpoint } from './registry.js';
import type { ChatRequestBody } from './shared.js';

export const NVIDIA_DEFAULTS = {
  baseUrl: 'https://integrate.api.nvidia.com',
  openaiPath: '/v1',
  apiKeyEnv: 'NVIDIA_API_KEY',
} as const;

export const NVIDIA_MODELS = {
  chat: {
    nvidia: [
      'nvidia/nemotron-mini-4b-instruct',
      'nvidia/nvidia-nemotron-nano-9b-v2',
      'nvidia/nemotron-3-nano-30b-a3b',
      'nvidia/nemotron-3-super-120b-a12b',
      'nvidia/nemotron-3-ultra-550b-a55b',
      'nvidia/llama-3.1-nemotron-nano-8b-v1',
      'nvidia/llama-3.3-nemotron-super-49b-v1',
      'nvidia/llama-3.3-nemotron-super-49b-v1.5',
      'nvidia/llama-3.1-nemotron-ultra-253b-v1',
      'nvidia/nemotron-content-safety-reasoning-4b',
      'nvidia/llama-3.1-nemoguard-8b-content-safety',
      'nvidia/llama-3.1-nemoguard-8b-topic-control',
      'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',
      'nvidia/nemoguard-jailbreak-detect',
      'nvidia/riva-translate-4b-instruct-v1_1',
      'nvidia/usdcode',
      'nvidia/gliner-pii',
    ],
    meta: [
      'meta/llama-3.1-8b-instruct',
      'meta/llama-3.1-70b-instruct',
      'meta/llama-3.2-1b-instruct',
      'meta/llama-3.2-3b-instruct',
      'meta/llama-3.3-70b-instruct',
    ],
    qwen: [
      'qwen/qwen2.5-coder-32b-instruct',
      'qwen/qwen3.5-122b-a10b',
      'qwen/qwen3-coder-480b-a35b-instruct',
      'qwen/qwen3-next-80b-a3b-instruct',
      'qwen/qwen3-next-80b-a3b-thinking',
      'qwen/qwq-32b',
    ],
    deepseek: ['deepseek-ai/deepseek-v4-flash', 'deepseek-ai/deepseek-v4-pro'],
    openai: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
    mistral: [
      'mistralai/mistral-nemotron',
      'mistralai/mixtral-8x7b-instruct',
      'mistralai/mixtral-8x22b-instruct',
    ],
    moonshot: ['moonshotai/kimi-k2-instruct', 'moonshotai/kimi-k2-thinking'],
    microsoft: ['microsoft/phi-4-mini-instruct', 'microsoft/phi-4-mini-flash-reasoning'],
    google: ['google/codegemma-7b', 'google/gemma-2-2b-it', 'google/gemma-7b'],
    minimax: ['minimaxai/minimax-m2.5', 'minimaxai/minimax-m2.7'],
    zai: ['z-ai/glm4.7', 'z-ai/glm5.1'],
    other: [
      'abacusai/dracarys-llama-3.1-70b-instruct',
      'bytedance/seed-oss-36b-instruct',
      'stepfun-ai/step-3-5-flash',
      'stockmark/stockmark-2-100b-instruct',
      'upstage/solar-10.7b-instruct',
      'sarvamai/sarvam-m',
    ],
  },
  embed: ['baai/bge-m3', 'nvidia/llama-3.2-nv-embedqa-1b-v2', 'nvidia/nv-embedqa-e5-v5'],
  rerank: [
    'nvidia/llama-3-2-nemoretriever-rerankqa-500m',
    'nvidia/llama-3.2-nemoretriever-rerankqa-1b-v2',
    'nvidia/nv-rerankqa-mistral-4b-v3',
  ],
} as const;

export function isNvidiaThinkingModel(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes('thinking') || m.includes('-reasoning')) {
    return true;
  }
  if (/nemotron.*(super|ultra)/.test(m) && !m.includes('mini-4b')) {
    return true;
  }
  if (m.includes('nemotron-content-safety-reasoning')) {
    return true;
  }
  if (m.includes('phi-4-mini-flash-reasoning')) {
    return true;
  }
  if (m.includes('deepseek-v4-pro') || m.endsWith('deepseek-v4-pro')) {
    return true;
  }
  if (m.includes('kimi-k2-thinking')) {
    return true;
  }
  return false;
}

export function isNvidiaVisionModel(_model: string): boolean {
  return false;
}

export interface NvidiaUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export function mapNvidiaUsage(u: NvidiaUsage): NvidiaUsage {
  const total =
    u.total_tokens !== undefined && u.total_tokens > 0
      ? u.total_tokens
      : u.prompt_tokens + u.completion_tokens;
  return {
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    total_tokens: total,
  };
}

export interface NvidiaForwardOptions {
  providersConfig?: ProvidersConfigMap;
}

function resolveBaseUrl(providersConfig?: ProvidersConfigMap): string {
  const endpoint = getProviderEndpoint('nvidia', providersConfig);
  const base = (endpoint.baseUrl || `${NVIDIA_DEFAULTS.baseUrl}${NVIDIA_DEFAULTS.openaiPath}`).replace(
    /\/$/,
    ''
  );
  return base;
}

export function buildNvidiaChatUrl(path: string, providersConfig?: ProvidersConfigMap): string {
  const base = resolveBaseUrl(providersConfig);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function nvidiaAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
}

function buildNvidiaChatBody(
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

export function mapNvidiaError(
  status: number,
  body: unknown
): { error: string; hint: string } {
  const message =
    typeof body === 'object' && body !== null && 'error' in body
      ? typeof (body as { error: unknown }).error === 'object' &&
        (body as { error: { message?: string } }).error !== null
        ? String((body as { error: { message?: string } }).error.message ?? 'NVIDIA NIM error')
        : String((body as { error: unknown }).error)
      : typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : typeof body === 'string'
          ? body
          : `NVIDIA NIM API error (${status})`;

  const hints: Record<number, string> = {
    400: 'Invalid request — check parameters and JSON shape',
    401: 'Authentication failed — verify NVIDIA_API_KEY',
    402: 'Out of NIM credits — top up or upgrade plan',
    403: 'Model gated — accept terms at build.nvidia.com',
    404: 'Model not found — check the slug at /v1/models',
    422: 'Invalid parameters for this NIM',
    429: 'Rate limited — back off and retry',
    500: 'Server error — retry after a brief wait',
    503: 'Server error — retry after a brief wait',
  };

  return {
    error: message,
    hint: hints[status] ?? 'Unexpected NVIDIA NIM API error',
  };
}

async function wrapNvidiaError(response: Response): Promise<Response> {
  const body = await parseErrorBody(response);
  const mapped = mapNvidiaError(response.status, body);
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

export async function nvidiaJsonRequest(
  method: 'GET' | 'POST',
  url: string,
  apiKey: string,
  body?: unknown
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      ...nvidiaAuthHeaders(apiKey),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  return fetch(url, init);
}

export async function forwardToNvidiaChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: NvidiaForwardOptions = {}
): Promise<Response> {
  const url = buildNvidiaChatUrl('/chat/completions', opts.providersConfig);
  const body = buildNvidiaChatBody(request, targetModel, false);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...nvidiaAuthHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapNvidiaError(response);
  }

  return response;
}

export async function forwardToNvidiaChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: NvidiaForwardOptions = {}
): Promise<Response> {
  const url = buildNvidiaChatUrl('/chat/completions', opts.providersConfig);
  const body = buildNvidiaChatBody(request, targetModel, true);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...nvidiaAuthHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapNvidiaError(response);
  }

  return response;
}

export async function nvidiaEmbed(
  body: unknown,
  apiKey: string,
  opts: NvidiaForwardOptions = {}
): Promise<Response> {
  const url = buildNvidiaChatUrl('/embeddings', opts.providersConfig);
  const response = await nvidiaJsonRequest('POST', url, apiKey, body);
  if (!response.ok) {
    return wrapNvidiaError(response);
  }
  return response;
}

export async function nvidiaRank(
  body: unknown,
  apiKey: string,
  opts: NvidiaForwardOptions = {}
): Promise<Response> {
  const url = buildNvidiaChatUrl('/ranking', opts.providersConfig);
  const response = await nvidiaJsonRequest('POST', url, apiKey, body);
  if (!response.ok) {
    return wrapNvidiaError(response);
  }
  return response;
}

export async function nvidiaListModels(
  apiKey: string,
  opts: NvidiaForwardOptions = {}
): Promise<Response> {
  const url = buildNvidiaChatUrl('/models', opts.providersConfig);
  const response = await nvidiaJsonRequest('GET', url, apiKey);
  if (!response.ok) {
    return wrapNvidiaError(response);
  }
  return response;
}
