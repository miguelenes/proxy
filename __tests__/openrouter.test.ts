/**
 * OpenRouter provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  OPENROUTER_DEFAULTS,
  mapOpenRouterError,
  mapOpenRouterUsage,
  parseOpenRouterModelSlug,
  toOpenAiChatCompletion,
} from '../src/providers/openrouter.js';

describe('parseOpenRouterModelSlug', () => {
  it('splits author and slug', () => {
    expect(parseOpenRouterModelSlug('anthropic/claude-sonnet-4-6')).toEqual({
      author: 'anthropic',
      slug: 'claude-sonnet-4-6',
    });
  });

  it('supports variant suffixes', () => {
    expect(parseOpenRouterModelSlug('openai/gpt-4:free')).toEqual({
      author: 'openai',
      slug: 'gpt-4:free',
    });
  });

  it('returns null for invalid paths', () => {
    expect(parseOpenRouterModelSlug('no-slash')).toBeNull();
    expect(parseOpenRouterModelSlug('/only-slug')).toBeNull();
  });
});

describe('mapOpenRouterUsage', () => {
  it('maps cached tokens and cost', () => {
    const normalized = mapOpenRouterUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 40 },
      cost: 0.002,
    });
    expect(normalized.cached_tokens).toBe(40);
    expect(normalized.cost).toBe(0.002);
  });
});

describe('mapOpenRouterError', () => {
  it('maps SDK HTTP errors with status', () => {
    const mapped = mapOpenRouterError({
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
      message: 'API error',
    });
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('OPENROUTER_API_KEY');
  });

  it('maps generic errors to 502', () => {
    const mapped = mapOpenRouterError(new Error('network fail'));
    expect(mapped.status).toBe(502);
  });
});

describe('toOpenAiChatCompletion', () => {
  it('converts SDK camelCase usage to OpenAI snake_case', () => {
    const payload = toOpenAiChatCompletion({
      id: 'gen-1',
      created: 1,
      model: 'anthropic/claude-sonnet-4-6',
      object: 'chat.completion',
      systemFingerprint: null,
      choices: [
        {
          index: 0,
          finishReason: 'stop',
          message: { role: 'assistant', content: 'hi' },
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        promptTokensDetails: { cachedTokens: 3 },
      },
    });
    const usage = payload.usage as Record<string, unknown>;
    expect(usage.prompt_tokens).toBe(10);
    expect((usage.prompt_tokens_details as { cached_tokens: number }).cached_tokens).toBe(3);
  });
});

describe('OPENROUTER_DEFAULTS', () => {
  it('uses OPENROUTER_API_KEY env name', () => {
    expect(OPENROUTER_DEFAULTS.apiKeyEnv).toBe('OPENROUTER_API_KEY');
  });
});
