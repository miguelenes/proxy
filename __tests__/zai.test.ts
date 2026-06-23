/**
 * z.ai provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  isZaiThinkingCapable,
  isZaiVisionModel,
  mapZaiUsage,
  mapZaiError,
  buildZaiPaasUrl,
  ZAI_DEFAULTS,
} from '../src/providers/zai.js';
import { estimateCost } from '../src/observability/telemetry.js';

describe('isZaiThinkingCapable', () => {
  it('is true for glm-5.2 and glm-4.7', () => {
    expect(isZaiThinkingCapable('glm-5.2')).toBe(true);
    expect(isZaiThinkingCapable('glm-4.7')).toBe(true);
  });

  it('is false for flash models', () => {
    expect(isZaiThinkingCapable('glm-4.5-flash')).toBe(false);
    expect(isZaiThinkingCapable('glm-4.7-flash')).toBe(false);
  });
});

describe('isZaiVisionModel', () => {
  it('detects vision and autoglm models', () => {
    expect(isZaiVisionModel('glm-5v-turbo')).toBe(true);
    expect(isZaiVisionModel('glm-4.6v')).toBe(true);
    expect(isZaiVisionModel('autoglm-phone-multilingual')).toBe(true);
    expect(isZaiVisionModel('glm-5.2')).toBe(false);
  });
});

describe('mapZaiUsage', () => {
  it('extracts cached_tokens from prompt_tokens_details', () => {
    const mapped = mapZaiUsage({
      prompt_tokens: 5000,
      completion_tokens: 500,
      total_tokens: 5500,
      prompt_tokens_details: { cached_tokens: 1000 },
    });
    expect(mapped.cached_tokens).toBe(1000);
    expect(mapped.prompt_cache_miss_tokens).toBe(4000);
  });
});

describe('estimateCost cache-hit branch', () => {
  it('computes glm-5.2 cost with cache hit and miss', () => {
    const cost = estimateCost('glm-5.2', 4000, 500, undefined, undefined, 1000);
    const expected =
      (4000 / 1_000_000) * 0.60 +
      (1000 / 1_000_000) * 0.06 +
      (500 / 1_000_000) * 2.0;
    expect(cost).toBeCloseTo(expected, 10);
  });
});

describe('mapZaiError', () => {
  it('returns hint text for common status and biz codes', () => {
    expect(mapZaiError(401, { error: { code: '1002', message: 'Invalid token' } }).hint).toContain(
      'ZAI_API_KEY'
    );
    expect(mapZaiError(429, { error: { code: '1113', message: 'Arrears' } }).hint).toContain(
      'arrears'
    );
    expect(mapZaiError(429, { error: { code: '1305', message: 'Rate limit' } }).hint).toContain(
      'Rate limited'
    );
    expect(mapZaiError(429, { error: { code: '1311', message: 'No model' } }).hint).toContain(
      'plan does not include'
    );
    expect(mapZaiError(500, { error: { code: '500', message: 'Internal' } }).hint).toContain(
      'Server error'
    );
  });
});

describe('buildZaiPaasUrl', () => {
  it('builds chat completions URL', () => {
    expect(buildZaiPaasUrl('/chat/completions')).toBe(
      `${ZAI_DEFAULTS.baseUrl}${ZAI_DEFAULTS.paasPath}/chat/completions`
    );
  });
});
