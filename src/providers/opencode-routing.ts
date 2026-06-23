/**
 * OpenCode Zen / Go model routing — per-model API protocol selection.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import { getProviderEndpoint } from './registry.js';

export type OpencodeTier = 'zen' | 'go';

export type OpencodeApiProtocol = 'anthropic' | 'responses' | 'chat' | 'gemini';

export const OPENCODE_ZEN_DEFAULTS = {
  baseUrl: 'https://opencode.ai/zen/v1',
  apiKeyEnv: 'OPENCODE_ZEN_API_KEY',
} as const;

export const OPENCODE_GO_DEFAULTS = {
  baseUrl: 'https://opencode.ai/zen/go/v1',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
  fallbackApiKeyEnv: 'OPENCODE_ZEN_API_KEY',
} as const;

export const OPENCODE_SERVER_DEFAULTS = {
  baseUrl: 'http://127.0.0.1:4096',
  baseUrlEnv: 'OPENCODE_SERVER_URL',
  apiKeyEnv: '',
} as const;

/** Base protocol per model id (Zen default); tier overrides applied in resolveOpencodeProtocol. */
const MODEL_PROTOCOLS: Record<string, OpencodeApiProtocol> = {
  // Anthropic
  'claude-opus-4-8': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'claude-opus-4-6': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'claude-opus-4-1': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-sonnet-4-5': 'anthropic',
  'claude-sonnet-4': 'anthropic',
  'claude-haiku-4-5': 'anthropic',

  // OpenAI Responses
  'gpt-5.5': 'responses',
  'gpt-5.5-pro': 'responses',
  'gpt-5.4': 'responses',
  'gpt-5.4-pro': 'responses',
  'gpt-5.4-mini': 'responses',
  'gpt-5.4-nano': 'responses',
  'gpt-5.3-codex': 'responses',
  'gpt-5.3-codex-spark': 'responses',
  'gpt-5.2': 'responses',
  'gpt-5.2-codex': 'responses',
  'gpt-5.1': 'responses',
  'gpt-5.1-codex': 'responses',
  'gpt-5.1-codex-max': 'responses',
  'gpt-5.1-codex-mini': 'responses',
  'gpt-5': 'responses',
  'gpt-5-codex': 'responses',
  'gpt-5-nano': 'responses',

  // Google Gemini
  'gemini-3.1-pro': 'gemini',
  'gemini-3-flash': 'gemini',
  'gemini-3.5-flash': 'gemini',

  // OpenAI Chat Completions
  'deepseek-v4-pro': 'chat',
  'deepseek-v4-flash': 'chat',
  'minimax-m2.5': 'chat',
  'minimax-m2.7': 'chat',
  'glm-5': 'chat',
  'glm-5.1': 'chat',
  'glm-5.2': 'chat',
  'grok-build-0.1': 'chat',
  'kimi-k2.5': 'chat',
  'kimi-k2.6': 'chat',
  'kimi-k2.7-code': 'chat',
  'minimax-m3': 'chat',
  'mimo-v2.5-pro': 'chat',
  'mimo-v2.5': 'chat',
  'big-pickle': 'chat',
  'nemotron-3-ultra-free': 'chat',
  'qwen3.5-plus': 'chat',
  'qwen3.6-plus': 'chat',
  'qwen3.7-plus': 'anthropic',
  'qwen3.7-max': 'anthropic',
};

/** Tier-specific protocol overrides (e.g. MiniMax on Zen vs Go). */
const TIER_PROTOCOL_OVERRIDES: Record<OpencodeTier, Record<string, OpencodeApiProtocol>> = {
  zen: {
    'minimax-m2.5': 'chat',
    'minimax-m2.7': 'chat',
  },
  go: {
    'minimax-m2.5': 'anthropic',
    'minimax-m2.7': 'anthropic',
    'minimax-m3': 'anthropic',
    'qwen3.7-plus': 'anthropic',
    'qwen3.7-max': 'anthropic',
  },
};

export interface ParsedOpencodeModel {
  tier: OpencodeTier;
  modelId: string;
}

export function parseOpencodeModelName(
  requestedModel: string
): ParsedOpencodeModel | null {
  if (requestedModel.startsWith('opencode-go/')) {
    return { tier: 'go', modelId: requestedModel.slice('opencode-go/'.length) };
  }
  if (requestedModel.startsWith('opencode/')) {
    return { tier: 'zen', modelId: requestedModel.slice('opencode/'.length) };
  }
  return null;
}

function inferProtocolFromId(modelId: string): OpencodeApiProtocol {
  if (modelId.startsWith('claude-')) {
    return 'anthropic';
  }
  if (modelId.startsWith('gpt-')) {
    return 'responses';
  }
  if (modelId.startsWith('gemini-')) {
    return 'gemini';
  }
  return 'chat';
}

export function resolveOpencodeProtocol(
  tier: OpencodeTier,
  modelId: string
): OpencodeApiProtocol {
  const tierOverride = TIER_PROTOCOL_OVERRIDES[tier][modelId];
  if (tierOverride) {
    return tierOverride;
  }
  return MODEL_PROTOCOLS[modelId] ?? inferProtocolFromId(modelId);
}

export function resolveOpencodeBaseUrl(
  tier: OpencodeTier,
  providersConfig?: ProvidersConfigMap
): string {
  const providerKey = tier === 'zen' ? 'opencode-zen' : 'opencode-go';
  const defaults = tier === 'zen' ? OPENCODE_ZEN_DEFAULTS : OPENCODE_GO_DEFAULTS;
  const endpoint = getProviderEndpoint(providerKey, providersConfig);
  return (endpoint.baseUrl || defaults.baseUrl).replace(/\/$/, '');
}

export function buildOpencodeUpstreamUrl(
  tier: OpencodeTier,
  protocol: OpencodeApiProtocol,
  modelId: string,
  stream = false,
  providersConfig?: ProvidersConfigMap
): string {
  const base = resolveOpencodeBaseUrl(tier, providersConfig);

  switch (protocol) {
    case 'responses':
      return `${base}/responses`;
    case 'anthropic':
      return `${base}/messages`;
    case 'chat':
      return `${base}/chat/completions`;
    case 'gemini':
      return stream
        ? `${base}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`
        : `${base}/models/${encodeURIComponent(modelId)}:generateContent`;
    default:
      return `${base}/chat/completions`;
  }
}

export function resolveOpencodeZenToken(config?: { apiKeyEnv?: string }): string | null {
  const envName = config?.apiKeyEnv ?? OPENCODE_ZEN_DEFAULTS.apiKeyEnv;
  const key = process.env[envName];
  return key?.trim() ? key.trim() : null;
}

export function resolveOpencodeGoToken(config?: { apiKeyEnv?: string }): string | null {
  const envName = config?.apiKeyEnv ?? OPENCODE_GO_DEFAULTS.apiKeyEnv;
  const primary = process.env[envName];
  if (primary?.trim()) {
    return primary.trim();
  }
  const fallback = process.env[OPENCODE_GO_DEFAULTS.fallbackApiKeyEnv];
  return fallback?.trim() ? fallback.trim() : null;
}

export function resolveOpencodeTokenFromBearer(bearer: string | null | undefined): string | null {
  if (!bearer?.trim()) {
    return null;
  }
  return bearer.trim();
}

export interface OpencodeErrorShape {
  error: string;
  hint: string;
  status: number;
}

export function mapOpencodeError(err: unknown, tier: OpencodeTier = 'zen'): OpencodeErrorShape {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return {
      error: message,
      hint:
        tier === 'go'
          ? 'Verify OPENCODE_GO_API_KEY (or OPENCODE_ZEN_API_KEY fallback) from the OpenCode Zen console'
          : 'Verify OPENCODE_ZEN_API_KEY from the OpenCode Zen console',
      status: 401,
    };
  }
  if (lower.includes('402') || lower.includes('payment') || lower.includes('insufficient')) {
    return {
      error: message,
      hint: 'OpenCode Zen balance exhausted — add credits at https://opencode.ai/zen',
      status: 402,
    };
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return {
      error: message,
      hint: 'OpenCode rate limit — retry after backoff or reduce concurrency',
      status: 429,
    };
  }

  return {
    error: message,
    hint: 'OpenCode upstream error — verify model id and API protocol routing',
    status: 502,
  };
}

export interface NormalizedOpencodeUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  cost?: number;
}

export function mapOpencodeUsage(usage: Record<string, unknown> | undefined): NormalizedOpencodeUsage {
  if (!usage) {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 };
  }

  const prompt =
    (usage['prompt_tokens'] as number | undefined) ??
    (usage['input_tokens'] as number | undefined) ??
    0;
  const completion =
    (usage['completion_tokens'] as number | undefined) ??
    (usage['output_tokens'] as number | undefined) ??
    0;
  const total = (usage['total_tokens'] as number | undefined) ?? prompt + completion;

  let cached = 0;
  const promptDetails = usage['prompt_tokens_details'] as Record<string, unknown> | undefined;
  const inputDetails = usage['input_tokens_details'] as Record<string, unknown> | undefined;
  if (promptDetails?.['cached_tokens'] != null) {
    cached = Number(promptDetails['cached_tokens']);
  } else if (inputDetails?.['cached_tokens'] != null) {
    cached = Number(inputDetails['cached_tokens']);
  }

  const cost = usage['cost'] != null ? Number(usage['cost']) : undefined;

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    cached_tokens: cached,
    ...(cost !== undefined ? { cost } : {}),
  };
}
