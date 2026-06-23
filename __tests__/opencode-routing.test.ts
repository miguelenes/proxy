/**
 * OpenCode routing tests.
 */
import { describe, it, expect } from 'vitest';
import {
  parseOpencodeModelName,
  resolveOpencodeProtocol,
  buildOpencodeUpstreamUrl,
  resolveOpencodeZenToken,
  resolveOpencodeGoToken,
  mapOpencodeError,
  mapOpencodeUsage,
  OPENCODE_ZEN_DEFAULTS,
  OPENCODE_GO_DEFAULTS,
} from '../src/providers/opencode-routing.js';

describe('parseOpencodeModelName', () => {
  it('parses Zen models', () => {
    expect(parseOpencodeModelName('opencode/gpt-5.5')).toEqual({
      tier: 'zen',
      modelId: 'gpt-5.5',
    });
    expect(parseOpencodeModelName('opencode/claude-sonnet-4-6')).toEqual({
      tier: 'zen',
      modelId: 'claude-sonnet-4-6',
    });
  });

  it('parses Go models', () => {
    expect(parseOpencodeModelName('opencode-go/deepseek-v4-flash')).toEqual({
      tier: 'go',
      modelId: 'deepseek-v4-flash',
    });
  });

  it('returns null for unrelated models', () => {
    expect(parseOpencodeModelName('anthropic/claude-sonnet-4-6')).toBeNull();
    expect(parseOpencodeModelName('gpt-5.4')).toBeNull();
  });
});

describe('resolveOpencodeProtocol', () => {
  it('routes GPT models to responses', () => {
    expect(resolveOpencodeProtocol('zen', 'gpt-5.4')).toBe('responses');
  });

  it('routes Claude models to anthropic', () => {
    expect(resolveOpencodeProtocol('zen', 'claude-sonnet-4-6')).toBe('anthropic');
  });

  it('routes DeepSeek to chat on Zen', () => {
    expect(resolveOpencodeProtocol('zen', 'deepseek-v4-flash')).toBe('chat');
  });

  it('applies MiniMax tier split', () => {
    expect(resolveOpencodeProtocol('zen', 'minimax-m2.5')).toBe('chat');
    expect(resolveOpencodeProtocol('go', 'minimax-m2.5')).toBe('anthropic');
    expect(resolveOpencodeProtocol('go', 'minimax-m2.7')).toBe('anthropic');
  });

  it('routes Go Qwen3.7 to anthropic', () => {
    expect(resolveOpencodeProtocol('go', 'qwen3.7-plus')).toBe('anthropic');
  });
});

describe('buildOpencodeUpstreamUrl', () => {
  it('builds chat URL', () => {
    expect(buildOpencodeUpstreamUrl('zen', 'chat', 'deepseek-v4-flash')).toBe(
      `${OPENCODE_ZEN_DEFAULTS.baseUrl}/chat/completions`
    );
  });

  it('builds messages URL', () => {
    expect(buildOpencodeUpstreamUrl('go', 'anthropic', 'minimax-m2.7')).toBe(
      `${OPENCODE_GO_DEFAULTS.baseUrl}/messages`
    );
  });

  it('builds responses URL', () => {
    expect(buildOpencodeUpstreamUrl('zen', 'responses', 'gpt-5.5')).toBe(
      `${OPENCODE_ZEN_DEFAULTS.baseUrl}/responses`
    );
  });

  it('builds gemini stream URL', () => {
    expect(buildOpencodeUpstreamUrl('zen', 'gemini', 'gemini-3-flash', true)).toBe(
      `${OPENCODE_ZEN_DEFAULTS.baseUrl}/models/gemini-3-flash:streamGenerateContent?alt=sse`
    );
  });
});

describe('token resolution', () => {
  it('reads Zen key from env', () => {
    const prev = process.env.OPENCODE_ZEN_API_KEY;
    process.env.OPENCODE_ZEN_API_KEY = 'zen-key';
    expect(resolveOpencodeZenToken()).toBe('zen-key');
    process.env.OPENCODE_ZEN_API_KEY = prev;
  });

  it('falls back Go key to Zen key', () => {
    const prevGo = process.env.OPENCODE_GO_API_KEY;
    const prevZen = process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_GO_API_KEY;
    process.env.OPENCODE_ZEN_API_KEY = 'shared-key';
    expect(resolveOpencodeGoToken()).toBe('shared-key');
    process.env.OPENCODE_GO_API_KEY = prevGo;
    process.env.OPENCODE_ZEN_API_KEY = prevZen;
  });
});

describe('mapOpencodeError', () => {
  it('maps 401 hints', () => {
    const mapped = mapOpencodeError(new Error('401 Unauthorized'));
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('OPENCODE_ZEN_API_KEY');
  });

  it('maps 402 payment hints', () => {
    const mapped = mapOpencodeError(new Error('402 payment required'));
    expect(mapped.status).toBe(402);
  });

  it('maps 429 rate limit hints', () => {
    const mapped = mapOpencodeError(new Error('429 rate limit'));
    expect(mapped.status).toBe(429);
  });
});

describe('mapOpencodeUsage', () => {
  it('maps cached read tokens', () => {
    const usage = mapOpencodeUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 40 },
    });
    expect(usage.cached_tokens).toBe(40);
    expect(usage.prompt_tokens).toBe(100);
  });
});
