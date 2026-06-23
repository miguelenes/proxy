/**
 * GitHub Copilot SDK provider module tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  COPILOT_DEFAULTS,
  resolveCopilotToken,
  resolveCopilotTokenFromBearer,
  mapCopilotError,
  extractCopilotPrompt,
} from '../src/providers/copilot.js';

describe('resolveCopilotToken', () => {
  const saved: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined): void {
    if (!(key in saved)) {
      saved[key] = process.env[key];
    }
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    setEnv(COPILOT_DEFAULTS.apiKeyEnv, undefined);
    setEnv(COPILOT_DEFAULTS.fallbackTokenEnv, undefined);
  });

  it('prefers config gitHubToken', () => {
    expect(resolveCopilotToken({ gitHubToken: 'cfg-token' })).toBe('cfg-token');
  });

  it('uses COPILOT_GITHUB_TOKEN before GITHUB_TOKEN', () => {
    setEnv(COPILOT_DEFAULTS.apiKeyEnv, 'copilot-env');
    setEnv(COPILOT_DEFAULTS.fallbackTokenEnv, 'github-env');
    expect(resolveCopilotToken()).toBe('copilot-env');
  });

  it('falls back to GITHUB_TOKEN', () => {
    setEnv(COPILOT_DEFAULTS.fallbackTokenEnv, 'github-env');
    expect(resolveCopilotToken()).toBe('github-env');
  });

  it('returns null when no token is configured', () => {
    expect(resolveCopilotToken()).toBeNull();
  });
});

describe('resolveCopilotTokenFromBearer', () => {
  it('trims bearer token', () => {
    expect(resolveCopilotTokenFromBearer('  gh_pat_abc  ')).toBe('gh_pat_abc');
  });

  it('returns null for empty bearer', () => {
    expect(resolveCopilotTokenFromBearer('')).toBeNull();
    expect(resolveCopilotTokenFromBearer(undefined)).toBeNull();
  });
});

describe('mapCopilotError', () => {
  it('maps auth errors to 401', () => {
    const mapped = mapCopilotError(new Error('Unauthorized: bad token'));
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('COPILOT_GITHUB_TOKEN');
  });

  it('maps timeout errors to 504', () => {
    const mapped = mapCopilotError(new Error('Request timed out'));
    expect(mapped.status).toBe(504);
    expect(mapped.hint).toContain('maxWaitMs');
  });

  it('maps CLI spawn errors to 502', () => {
    const mapped = mapCopilotError(new Error('spawn ENOENT'));
    expect(mapped.status).toBe(502);
    expect(mapped.hint).toContain('Node.js');
  });
});

describe('extractCopilotPrompt', () => {
  it('uses last user message as primary content', () => {
    const prompt = extractCopilotPrompt([
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
    ]);
    expect(prompt).toBe('second');
  });

  it('prepends system messages before user text', () => {
    const prompt = extractCopilotPrompt([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(prompt).toBe('You are helpful.\n\nHello');
  });

  it('extracts text from multipart content', () => {
    const prompt = extractCopilotPrompt([
      {
        role: 'user',
        content: [{ type: 'text', text: 'multipart hello' }],
      },
    ]);
    expect(prompt).toBe('multipart hello');
  });
});

describe('COPILOT_DEFAULTS', () => {
  it('defines sticky session header name', () => {
    expect(COPILOT_DEFAULTS.sessionHeader).toBe('x-copilot-session-id');
  });
});
