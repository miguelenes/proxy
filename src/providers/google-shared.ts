/**
 * Shared Google / Gemini API key resolution.
 *
 * @packageDocumentation
 */

export const GOOGLE_API_DEFAULTS = {
  apiKeyEnv: 'GEMINI_API_KEY',
  fallbackApiKeyEnv: 'GOOGLE_API_KEY',
} as const;

export interface GoogleApiKeyConfig {
  apiKeyEnv?: string;
  apiKey?: string;
}

export function resolveGoogleApiKey(config?: GoogleApiKeyConfig): string | null {
  if (config?.apiKey?.trim()) {
    return config.apiKey.trim();
  }
  const primaryEnv = config?.apiKeyEnv ?? GOOGLE_API_DEFAULTS.apiKeyEnv;
  const primary = process.env[primaryEnv];
  if (primary?.trim()) {
    return primary.trim();
  }
  const fallback = process.env[GOOGLE_API_DEFAULTS.fallbackApiKeyEnv];
  return fallback?.trim() ? fallback.trim() : null;
}

export function resolveGoogleApiKeyFromBearer(bearer: string | null | undefined): string | null {
  if (!bearer?.trim()) {
    return null;
  }
  return bearer.trim();
}

export function mapGoogleError(err: unknown, hint?: string): { error: string; hint: string; status: number } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
    return {
      error: message,
      hint: hint ?? 'Set GEMINI_API_KEY or GOOGLE_API_KEY, or pass Authorization: Bearer <api_key>',
      status: 401,
    };
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      error: message,
      hint: 'Google API rate limit — retry with backoff',
      status: 429,
    };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      error: message,
      hint: 'Google request timed out — Antigravity agent tasks can take several minutes',
      status: 504,
    };
  }

  return {
    error: message,
    hint: hint ?? 'Google API error — verify key, model, and request format',
    status: 502,
  };
}
