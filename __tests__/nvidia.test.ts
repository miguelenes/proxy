/**
 * NVIDIA NIM provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  isNvidiaThinkingModel,
  isNvidiaVisionModel,
  mapNvidiaUsage,
  mapNvidiaError,
  buildNvidiaChatUrl,
  NVIDIA_DEFAULTS,
} from '../src/providers/nvidia.js';
import { estimateCost } from '../src/observability/telemetry.js';

describe('isNvidiaThinkingModel', () => {
  it('is true for Nemotron super, qwen thinking, and kimi thinking models', () => {
    expect(isNvidiaThinkingModel('nvidia/llama-3.3-nemotron-super-49b-v1.5')).toBe(true);
    expect(isNvidiaThinkingModel('qwen/qwen3-next-80b-a3b-thinking')).toBe(true);
    expect(isNvidiaThinkingModel('moonshotai/kimi-k2-thinking')).toBe(true);
    expect(isNvidiaThinkingModel('microsoft/phi-4-mini-flash-reasoning')).toBe(true);
  });

  it('is false for standard instruct models', () => {
    expect(isNvidiaThinkingModel('meta/llama-3.1-8b-instruct')).toBe(false);
    expect(isNvidiaThinkingModel('nvidia/nemotron-mini-4b-instruct')).toBe(false);
  });
});

describe('isNvidiaVisionModel', () => {
  it('returns false for current LLM catalog', () => {
    expect(isNvidiaVisionModel('meta/llama-3.3-70b-instruct')).toBe(false);
  });
});

describe('mapNvidiaUsage', () => {
  it('normalizes token counts', () => {
    const mapped = mapNvidiaUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
    });
    expect(mapped.prompt_tokens).toBe(1000);
    expect(mapped.completion_tokens).toBe(200);
    expect(mapped.total_tokens).toBe(1200);
  });

  it('computes total_tokens when omitted', () => {
    const mapped = mapNvidiaUsage({
      prompt_tokens: 500,
      completion_tokens: 100,
      total_tokens: 0,
    });
    expect(mapped.total_tokens).toBe(600);
  });
});

describe('mapNvidiaError', () => {
  it('returns hint text for common status codes', () => {
    expect(mapNvidiaError(401, { error: 'unauthorized' }).hint).toContain('NVIDIA_API_KEY');
    expect(mapNvidiaError(402, { error: 'payment required' }).hint).toContain('credits');
    expect(mapNvidiaError(403, { error: 'forbidden' }).hint).toContain('build.nvidia.com');
    expect(mapNvidiaError(404, { error: 'not found' }).hint).toContain('/v1/models');
    expect(mapNvidiaError(429, { error: 'rate limit' }).hint).toContain('Rate limited');
    expect(mapNvidiaError(500, { error: 'internal' }).hint).toContain('Server error');
  });
});

describe('estimateCost', () => {
  it('computes cost for nemotron-3-super-120b-a12b', () => {
    const cost = estimateCost('nvidia/nemotron-3-super-120b-a12b', 1000, 500);
    const expected = (1000 / 1_000_000) * 0.50 + (500 / 1_000_000) * 1.50;
    expect(cost).toBeCloseTo(expected, 10);
  });
});

describe('buildNvidiaChatUrl', () => {
  it('builds chat completions URL', () => {
    expect(buildNvidiaChatUrl('/chat/completions')).toBe(
      `${NVIDIA_DEFAULTS.baseUrl}${NVIDIA_DEFAULTS.openaiPath}/chat/completions`
    );
  });
});
