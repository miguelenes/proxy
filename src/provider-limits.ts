/**
 * Provider rate-limit static defaults.
 *
 * These are conservative best-known values used when no live header data has
 * been received yet.  The token pool will update them as real
 * `anthropic-ratelimit-*` / `x-ratelimit-*` response headers are observed.
 */

export interface ProviderLimitDefaults {
  /** Requests per minute (RPM) */
  rpm: number;
  /** Input tokens per minute */
  tpm: number;
}

/**
 * Keyed by `"provider:tier"` strings so different subscription tiers can have
 * different defaults.  The pool uses the key `"anthropic:default"` for
 * standard API keys and `"anthropic:max"` for Claude Max (OAT) tokens.
 */
export const PROVIDER_LIMIT_DEFAULTS: Record<string, ProviderLimitDefaults> = {
  // Anthropic — standard API key (Tier 1 / Free)
  'anthropic:default': { rpm: 50, tpm: 40_000 },
  // Anthropic — Claude Max subscription (OAT token)
  'anthropic:max': { rpm: 60, tpm: 80_000 },
  // OpenAI
  'openai:default': { rpm: 60, tpm: 90_000 },
  // OpenRouter
  'openrouter:default': { rpm: 60, tpm: 100_000 },
  // Google Gemini
  'google:default': { rpm: 60, tpm: 100_000 },
  // xAI Grok
  'xai:default': { rpm: 60, tpm: 100_000 },
  // Groq
  'groq:default': { rpm: 30, tpm: 100_000 },
  // DeepSeek — concurrency proxy (no hard RPM; flash tier ~2500 concurrent)
  'deepseek:default': { rpm: 2500, tpm: 1_000_000 },
  // Mistral
  'mistral:default': { rpm: 60, tpm: 100_000 },
  // NVIDIA NIM
  'nvidia:default': { rpm: 60, tpm: 100_000 },
  // z.ai
  'zai:default': { rpm: 60, tpm: 100_000 },
  // Ollama Cloud
  'ollama-cloud:default': { rpm: 30, tpm: 50_000 },
  // Azure Foundry
  'azure-foundry:default': { rpm: 60, tpm: 100_000 },
  // Kimi / Moonshot
  'kimi:default': { rpm: 60, tpm: 100_000 },
  // Qwen / DashScope
  'qwen:default': { rpm: 60, tpm: 100_000 },
};

/**
 * Return the best-known RPM default for a given provider + token type.
 */
export function getDefaultRpm(provider: string, isMaxToken: boolean): number {
  const tier = isMaxToken ? 'max' : 'default';
  return (
    PROVIDER_LIMIT_DEFAULTS[`${provider}:${tier}`]?.rpm ??
    PROVIDER_LIMIT_DEFAULTS[`${provider}:default`]?.rpm ??
    50
  );
}
