/**
 * DeepSeek provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  DEEPSEEK_LEGACY_ALIASES,
  isPrefixCompletion,
  isThinkingModel,
  mapDeepSeekUsage,
  mapDeepSeekError,
} from '../src/providers/deepseek.js';
import { estimateCost } from '../src/observability/telemetry.js';

describe('isPrefixCompletion', () => {
  it('returns true when last assistant message has prefix: true', () => {
    expect(
      isPrefixCompletion([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', prefix: true, content: 'Hello' },
      ])
    ).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isPrefixCompletion([{ role: 'user', content: 'Hi' }])).toBe(false);
    expect(
      isPrefixCompletion([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ])
    ).toBe(false);
  });
});

describe('isThinkingModel', () => {
  it('is true for v4-pro and legacy reasoner', () => {
    expect(isThinkingModel('deepseek-v4-pro')).toBe(true);
    expect(isThinkingModel('deepseek-reasoner')).toBe(true);
  });

  it('is false for v4-flash', () => {
    expect(isThinkingModel('deepseek-v4-flash')).toBe(false);
    expect(isThinkingModel('deepseek-chat')).toBe(false);
  });
});

describe('DEEPSEEK_LEGACY_ALIASES', () => {
  it('resolves legacy model names', () => {
    expect(DEEPSEEK_LEGACY_ALIASES['deepseek-chat']).toBe('deepseek-v4-flash');
    expect(DEEPSEEK_LEGACY_ALIASES['deepseek-reasoner']).toBe('deepseek-v4-pro');
  });
});

describe('mapDeepSeekUsage', () => {
  it('extracts hit and miss tokens', () => {
    const mapped = mapDeepSeekUsage({
      prompt_tokens: 5000,
      completion_tokens: 500,
      total_tokens: 5500,
      prompt_cache_hit_tokens: 1000,
      prompt_cache_miss_tokens: 4000,
    });
    expect(mapped.prompt_cache_hit_tokens).toBe(1000);
    expect(mapped.prompt_cache_miss_tokens).toBe(4000);
  });

  it('derives miss from prompt_tokens when miss is absent', () => {
    const mapped = mapDeepSeekUsage({
      prompt_tokens: 5000,
      completion_tokens: 500,
      total_tokens: 5500,
      prompt_cache_hit_tokens: 1000,
    });
    expect(mapped.prompt_cache_miss_tokens).toBe(4000);
  });
});

describe('estimateCost cache-hit branch', () => {
  it('computes v4-flash cost with cache hit and miss', () => {
    // 1000 hit @ 0.0028/M + 4000 miss @ 0.14/M + 500 out @ 0.28/M
    const cost = estimateCost('deepseek-v4-flash', 4000, 500, undefined, undefined, 1000);
    const expected =
      (4000 / 1_000_000) * 0.14 +
      (1000 / 1_000_000) * 0.0028 +
      (500 / 1_000_000) * 0.28;
    expect(cost).toBeCloseTo(expected, 10);
  });
});

describe('mapDeepSeekError', () => {
  it('returns hint text for common status codes', () => {
    expect(mapDeepSeekError(401, { error: 'Unauthorized' }).hint).toContain('DEEPSEEK_API_KEY');
    expect(mapDeepSeekError(402, { error: 'Payment Required' }).hint).toContain('platform.deepseek.com');
    expect(mapDeepSeekError(429, { error: 'Too Many Requests' }).hint).toContain('Rate limited');
    expect(mapDeepSeekError(503, { error: 'Unavailable' }).hint).toContain('Server error');
  });
});
