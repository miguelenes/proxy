/**
 * OpenCode server provider tests.
 */
import { describe, it, expect } from 'vitest';
import { mapOpencodeServerError, OPENCODE_SERVER_DEFAULTS } from '../src/providers/opencode.js';
import { resolveExplicitModel } from '../src/standalone-proxy.js';

describe('resolveExplicitModel opencode prefixes', () => {
  it('maps opencode/* to opencode-zen', () => {
    expect(resolveExplicitModel('opencode/claude-sonnet-4-6')).toEqual({
      provider: 'opencode-zen',
      model: 'claude-sonnet-4-6',
    });
  });

  it('maps opencode-go/* to opencode-go', () => {
    expect(resolveExplicitModel('opencode-go/glm-5.2')).toEqual({
      provider: 'opencode-go',
      model: 'glm-5.2',
    });
  });
});

describe('mapOpencodeServerError', () => {
  it('maps connection refused to 503', () => {
    const mapped = mapOpencodeServerError(new Error('fetch failed ECONNREFUSED'));
    expect(mapped.status).toBe(503);
    expect(mapped.hint).toContain('4096');
  });
});

describe('OPENCODE_SERVER_DEFAULTS', () => {
  it('defaults to local agent server', () => {
    expect(OPENCODE_SERVER_DEFAULTS.baseUrl).toBe('http://127.0.0.1:4096');
  });
});
