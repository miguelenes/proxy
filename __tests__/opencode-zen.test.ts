/**
 * OpenCode Zen provider tests.
 */
import { describe, it, expect } from 'vitest';
import {
  mapOpencodeZenError,
  mapOpencodeZenUsage,
  resolveOpencodeProtocol,
} from '../src/providers/opencode-zen.js';

describe('mapOpencodeZenError', () => {
  it('maps unauthorized errors', () => {
    const mapped = mapOpencodeZenError(new Error('invalid api key'));
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('OPENCODE_ZEN_API_KEY');
  });
});

describe('mapOpencodeZenUsage', () => {
  it('normalizes OpenAI-style usage', () => {
    expect(
      mapOpencodeZenUsage({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }).total_tokens
    ).toBe(15);
  });
});

describe('resolveOpencodeProtocol via zen module', () => {
  it('keeps Gemini on google path', () => {
    expect(resolveOpencodeProtocol('zen', 'gemini-3.1-pro')).toBe('gemini');
  });
});
