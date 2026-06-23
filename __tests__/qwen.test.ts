/**
 * Qwen / DashScope cloud provider module tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  QWEN_DEFAULTS,
  resolveQwenApiKey,
  resolveQwenBaseUrl,
  mapQwenUsage,
  mapQwenError,
  applyQwenThinkingDefaults,
  isQwenThinkingModel,
} from '../src/providers/qwen.js';
import { VALID_SLASH_PROVIDERS } from '../src/providers/registry.js';

describe('resolveQwenBaseUrl', () => {
  it('defaults to international API', () => {
    expect(resolveQwenBaseUrl()).toBe(QWEN_DEFAULTS.internationalBaseUrl);
  });

  it('uses china region when configured', () => {
    expect(resolveQwenBaseUrl({ region: 'china' })).toBe(QWEN_DEFAULTS.chinaBaseUrl);
  });

  it('uses us region when configured', () => {
    expect(resolveQwenBaseUrl({ region: 'us' })).toBe(QWEN_DEFAULTS.usBaseUrl);
  });

  it('prefers explicit baseUrl override', () => {
    expect(resolveQwenBaseUrl({ baseUrl: 'https://custom.example/v1' })).toBe(
      'https://custom.example/v1'
    );
  });
});

describe('resolveQwenApiKey', () => {
  const original = process.env['DASHSCOPE_API_KEY'];

  afterEach(() => {
    if (original === undefined) {
      delete process.env['DASHSCOPE_API_KEY'];
    } else {
      process.env['DASHSCOPE_API_KEY'] = original;
    }
  });

  it('reads DASHSCOPE_API_KEY', () => {
    process.env['DASHSCOPE_API_KEY'] = 'sk-dashscope';
    expect(resolveQwenApiKey()).toBe('sk-dashscope');
  });

  it('respects custom apiKeyEnv', () => {
    delete process.env['DASHSCOPE_API_KEY'];
    process.env['MY_QWEN_KEY'] = 'sk-custom';
    expect(resolveQwenApiKey({ apiKeyEnv: 'MY_QWEN_KEY' })).toBe('sk-custom');
    delete process.env['MY_QWEN_KEY'];
  });
});

describe('slash provider resolution', () => {
  it('includes qwen in VALID_SLASH_PROVIDERS', () => {
    expect(VALID_SLASH_PROVIDERS).toContain('qwen');
    expect(VALID_SLASH_PROVIDERS).toContain('qwen-agent');
  });
});

describe('mapQwenUsage', () => {
  it('normalizes cached_tokens from prompt_tokens_details', () => {
    const mapped = mapQwenUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      prompt_tokens_details: { cached_tokens: 300 },
    });
    expect(mapped.cached_tokens).toBe(300);
    expect(mapped.prompt_tokens).toBe(1000);
    expect(mapped.completion_tokens).toBe(200);
  });
});

describe('mapQwenError', () => {
  it('maps 401 with DashScope hint', () => {
    const mapped = mapQwenError(401, { error: 'Unauthorized' });
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('DASHSCOPE_API_KEY');
  });

  it('maps 429 rate limit', () => {
    const mapped = mapQwenError(429, { error: 'Too many requests' });
    expect(mapped.status).toBe(429);
    expect(mapped.hint.toLowerCase()).toContain('rate');
  });
});

describe('applyQwenThinkingDefaults', () => {
  it('injects enable_thinking false for Qwen3 non-stream when unset', () => {
    expect(isQwenThinkingModel('qwen/qwen3-plus')).toBe(true);
    const body = applyQwenThinkingDefaults({ model: 'qwen3-plus' }, 'qwen3-plus', {}, false);
    expect(body['enable_thinking']).toBe(false);
  });

  it('does not override explicit enable_thinking', () => {
    const body = applyQwenThinkingDefaults(
      { model: 'qwen3-plus', enable_thinking: true },
      'qwen3-plus',
      {},
      false
    );
    expect(body['enable_thinking']).toBe(true);
  });

  it('skips thinking defaults for stream requests', () => {
    const body = applyQwenThinkingDefaults({ model: 'qwen3-plus' }, 'qwen3-plus', {}, true);
    expect(body['enable_thinking']).toBeUndefined();
  });
});

describe.skipIf(!process.env['DASHSCOPE_API_KEY'])('qwen live smoke', () => {
  it('can ping models endpoint', async () => {
    const { qwenPing } = await import('../src/providers/qwen.js');
    const result = await qwenPing(process.env['DASHSCOPE_API_KEY']!);
    expect(result.ok).toBe(true);
  });
});
