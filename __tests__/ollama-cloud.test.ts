/**
 * Ollama Cloud provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  stripCloudSuffix,
  isOllamaCloudModel,
  supportsThink,
  mapOllamaUsage,
  mapOllamaCloudError,
  buildOllamaCloudOpenAiUrl,
  buildOllamaCloudNativeUrl,
  OLLAMA_CLOUD_DEFAULTS,
} from '../src/providers/ollama-cloud.js';

describe('stripCloudSuffix', () => {
  it('removes :cloud and -cloud suffixes', () => {
    expect(stripCloudSuffix('gpt-oss:120b-cloud')).toBe('gpt-oss:120b');
    expect(stripCloudSuffix('glm-4.6:cloud')).toBe('glm-4.6');
    expect(stripCloudSuffix('gpt-oss:120b')).toBe('gpt-oss:120b');
  });
});

describe('isOllamaCloudModel', () => {
  it('is true for catalog models and cloud suffixes', () => {
    expect(isOllamaCloudModel('gpt-oss:120b')).toBe(true);
    expect(isOllamaCloudModel('glm-4.6:cloud')).toBe(true);
    expect(isOllamaCloudModel('gpt-oss:120b-cloud')).toBe(true);
    expect(isOllamaCloudModel('embeddinggemma')).toBe(true);
  });

  it('is false for unrelated models', () => {
    expect(isOllamaCloudModel('claude-sonnet-4-6')).toBe(false);
  });
});

describe('supportsThink', () => {
  it('is true for gpt-oss, glm-4.6, and qwen3 models', () => {
    expect(supportsThink('gpt-oss:20b')).toBe(true);
    expect(supportsThink('glm-4.6:cloud')).toBe(true);
    expect(supportsThink('qwen3-coder:480b')).toBe(true);
  });

  it('is false for embedding models', () => {
    expect(supportsThink('embeddinggemma')).toBe(false);
  });
});

describe('mapOllamaUsage', () => {
  it('maps prompt_eval_count and eval_count to token fields', () => {
    const mapped = mapOllamaUsage({
      prompt_eval_count: 120,
      eval_count: 45,
      total_duration: 1_000_000,
    });
    expect(mapped.input_tokens).toBe(120);
    expect(mapped.output_tokens).toBe(45);
    expect(mapped.total_tokens).toBe(165);
    expect(mapped.total_duration_ns).toBe(1_000_000);
  });
});

describe('mapOllamaCloudError', () => {
  it('returns hints for common status codes', () => {
    expect(mapOllamaCloudError(401, { error: 'unauthorized' }).hint).toContain('OLLAMA_API_KEY');
    expect(mapOllamaCloudError(404, { error: 'not found' }).hint).toContain('Model not found');
    expect(mapOllamaCloudError(429, { error: 'rate limit' }).hint).toContain('Rate limited');
    expect(mapOllamaCloudError(502, { error: 'bad gateway' }).hint).toContain('unreachable');
    expect(mapOllamaCloudError(500, { error: 'internal' }).hint).toContain('Server error');
  });
});

describe('URL builders', () => {
  it('builds OpenAI-compat and native API URLs', () => {
    expect(buildOllamaCloudOpenAiUrl('/chat/completions')).toBe(
      `${OLLAMA_CLOUD_DEFAULTS.baseUrl}${OLLAMA_CLOUD_DEFAULTS.openaiPath}/chat/completions`
    );
    expect(buildOllamaCloudNativeUrl('/generate')).toBe(
      `${OLLAMA_CLOUD_DEFAULTS.baseUrl}${OLLAMA_CLOUD_DEFAULTS.nativePath}/generate`
    );
  });
});
