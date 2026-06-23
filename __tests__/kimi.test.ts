/**
 * Kimi / Moonshot cloud provider module tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  KIMI_DEFAULTS,
  resolveKimiApiKey,
  resolveKimiBaseUrl,
  mapKimiUsage,
  mapKimiError,
} from '../src/providers/kimi.js';
import { VALID_SLASH_PROVIDERS } from '../src/providers/registry.js';

describe('resolveKimiBaseUrl', () => {
  it('defaults to international API', () => {
    expect(resolveKimiBaseUrl()).toBe(KIMI_DEFAULTS.internationalBaseUrl);
  });

  it('uses china region when configured', () => {
    expect(resolveKimiBaseUrl({ region: 'china' })).toBe(KIMI_DEFAULTS.chinaBaseUrl);
  });

  it('prefers explicit baseUrl override', () => {
    expect(resolveKimiBaseUrl({ baseUrl: 'https://custom.example/v1' })).toBe(
      'https://custom.example/v1'
    );
  });
});

describe('resolveKimiApiKey', () => {
  const originalMoonshot = process.env['MOONSHOT_API_KEY'];
  const originalKimi = process.env['KIMI_API_KEY'];

  afterEach(() => {
    if (originalMoonshot === undefined) {
      delete process.env['MOONSHOT_API_KEY'];
    } else {
      process.env['MOONSHOT_API_KEY'] = originalMoonshot;
    }
    if (originalKimi === undefined) {
      delete process.env['KIMI_API_KEY'];
    } else {
      process.env['KIMI_API_KEY'] = originalKimi;
    }
  });

  it('prefers MOONSHOT_API_KEY over KIMI_API_KEY', () => {
    process.env['MOONSHOT_API_KEY'] = 'sk-moonshot';
    process.env['KIMI_API_KEY'] = 'sk-kimi';
    expect(resolveKimiApiKey()).toBe('sk-moonshot');
  });

  it('falls back to KIMI_API_KEY', () => {
    delete process.env['MOONSHOT_API_KEY'];
    process.env['KIMI_API_KEY'] = 'sk-kimi';
    expect(resolveKimiApiKey()).toBe('sk-kimi');
  });
});

describe('slash provider resolution', () => {
  it('includes kimi in VALID_SLASH_PROVIDERS', () => {
    expect(VALID_SLASH_PROVIDERS).toContain('kimi');
    expect(VALID_SLASH_PROVIDERS).toContain('kimi-agent');
  });
});

describe('mapKimiUsage', () => {
  it('normalizes cached_tokens', () => {
    const mapped = mapKimiUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      cached_tokens: 300,
    });
    expect(mapped.cached_tokens).toBe(300);
    expect(mapped.prompt_tokens).toBe(1000);
    expect(mapped.completion_tokens).toBe(200);
  });
});

describe('mapKimiError', () => {
  it('maps 401 with platform hint', () => {
    const mapped = mapKimiError(401, { error: 'Unauthorized' });
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('MOONSHOT_API_KEY');
  });

  it('maps 402 insufficient balance', () => {
    const mapped = mapKimiError(402, { error: 'Payment required' });
    expect(mapped.status).toBe(402);
    expect(mapped.hint).toContain('balance');
  });

  it('maps 429 rate limit', () => {
    const mapped = mapKimiError(429, { error: 'Too many requests' });
    expect(mapped.status).toBe(429);
    expect(mapped.hint.toLowerCase()).toContain('rate');
  });
});

describe.skipIf(!process.env['MOONSHOT_API_KEY'])('kimi live smoke', () => {
  it('can ping models endpoint', async () => {
    const { kimiPing } = await import('../src/providers/kimi.js');
    const result = await kimiPing(process.env['MOONSHOT_API_KEY']!);
    expect(result.ok).toBe(true);
  });
});
