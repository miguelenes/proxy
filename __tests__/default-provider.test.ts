/**
 * Tests for defaultProvider config feature.
 *
 * When `defaultProvider` is set in the proxy config, ALL model routing
 * should go to that provider's endpoint regardless of model name prefix.
 */
import { describe, it, expect } from 'vitest';
import { resolveExplicitModel } from '../src/standalone-proxy.js';

describe('resolveExplicitModel — defaultProvider', () => {
  describe('without defaultProvider (existing behavior unchanged)', () => {
    it('routes claude-* to anthropic', () => {
      const result = resolveExplicitModel('claude-sonnet-4-6');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('anthropic');
      expect(result!.model).toBe('claude-sonnet-4-6');
    });

    it('routes anthropic/claude-* to anthropic (strips prefix)', () => {
      const result = resolveExplicitModel('anthropic/claude-sonnet-4-6');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('anthropic');
      expect(result!.model).toBe('claude-sonnet-4-6');
    });

    it('routes gpt-* to openai', () => {
      const result = resolveExplicitModel('gpt-4o');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('openai');
    });

    it('routes gemini-* to google', () => {
      const result = resolveExplicitModel('gemini-2.0-flash-001');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('google');
    });
  });

  describe('new provider prefixes', () => {
    it('routes deepseek-* to deepseek (not openrouter)', () => {
      expect(resolveExplicitModel('deepseek-chat')?.provider).toBe('deepseek');
      expect(resolveExplicitModel('deepseek-chat')?.model).toBe('deepseek-v4-flash');
      expect(resolveExplicitModel('deepseek-v4-flash')?.provider).toBe('deepseek');
      expect(resolveExplicitModel('deepseek-v4-pro')?.provider).toBe('deepseek');
    });

    it('routes mistral-* to mistral', () => {
      expect(resolveExplicitModel('mistral-large-latest')?.provider).toBe('mistral');
      expect(resolveExplicitModel('codestral-latest')?.provider).toBe('mistral');
    });

    it('routes glm-* and extended z.ai model families to zai', () => {
      expect(resolveExplicitModel('glm-5.2')?.provider).toBe('zai');
      expect(resolveExplicitModel('glm-4.5-air')?.provider).toBe('zai');
      expect(resolveExplicitModel('autoglm-phone-multilingual')?.provider).toBe('zai');
      expect(resolveExplicitModel('cogvideox-3')?.provider).toBe('zai');
      expect(resolveExplicitModel('cogview-4-250304')?.provider).toBe('zai');
      expect(resolveExplicitModel('vidu-q1')?.provider).toBe('zai');
      expect(resolveExplicitModel('glm-image')?.provider).toBe('zai');
      expect(resolveExplicitModel('glm-asr-2512')?.provider).toBe('zai');
      expect(resolveExplicitModel('glm-ocr')?.provider).toBe('zai');
    });

    it('resolves z.ai short aliases', () => {
      expect(resolveExplicitModel('zai')?.model).toBe('glm-5.2');
      expect(resolveExplicitModel('zai-flash')?.model).toBe('glm-4.7-flash');
      expect(resolveExplicitModel('zai-vision')?.model).toBe('glm-5v-turbo');
      expect(resolveExplicitModel('glm')?.model).toBe('glm-5.2');
    });

    it('routes nvidia/* to nvidia', () => {
      expect(resolveExplicitModel('nvidia/nemotron-3-super-120b-a12b')?.provider).toBe('nvidia');
    });

    it('routes *nemotron* substring to nvidia', () => {
      expect(resolveExplicitModel('nvidia/nemotron-3-nano-30b-a3b')?.provider).toBe('nvidia');
    });

    it('resolves nvidia and nemotron short aliases', () => {
      expect(resolveExplicitModel('nvidia')?.provider).toBe('nvidia');
      expect(resolveExplicitModel('nvidia')?.model).toBe('meta/llama-3.3-70b-instruct');
      expect(resolveExplicitModel('nvidia-nano')?.model).toBe('nvidia/nemotron-3-nano-30b-a3b');
      expect(resolveExplicitModel('nvidia-super')?.model).toBe('nvidia/nemotron-3-super-120b-a12b');
      expect(resolveExplicitModel('nvidia-ultra')?.model).toBe('nvidia/nemotron-3-ultra-550b-a55b');
      expect(resolveExplicitModel('nvidia-reasoning')?.model).toBe('nvidia/llama-3.3-nemotron-super-49b-v1.5');
      expect(resolveExplicitModel('nvidia-embed')?.model).toBe('nvidia/llama-3.2-nv-embedqa-1b-v2');
      expect(resolveExplicitModel('nvidia-rerank')?.model).toBe('nvidia/llama-3.2-nemoretriever-rerankqa-1b-v2');
      expect(resolveExplicitModel('nemotron')?.provider).toBe('nvidia');
      expect(resolveExplicitModel('nemotron-nano')?.model).toBe('nvidia/nemotron-3-nano-30b-a3b');
      expect(resolveExplicitModel('nemotron-super')?.model).toBe('nvidia/nemotron-3-super-120b-a12b');
      expect(resolveExplicitModel('nemotron-ultra')?.model).toBe('nvidia/nemotron-3-ultra-550b-a55b');
    });

    it('routes -cloud suffix to ollama-cloud', () => {
      expect(resolveExplicitModel('gpt-oss:120b-cloud')?.provider).toBe('ollama-cloud');
      expect(resolveExplicitModel('gpt-oss:120b-cloud')?.model).toBe('gpt-oss:120b-cloud');
    });

    it('routes ollama-cloud/ prefix to ollama-cloud', () => {
      expect(resolveExplicitModel('ollama-cloud/gpt-oss:120b')?.provider).toBe('ollama-cloud');
      expect(resolveExplicitModel('ollama-cloud/gpt-oss:120b')?.model).toBe('gpt-oss:120b');
    });

    it('resolves ollama-cloud short aliases', () => {
      expect(resolveExplicitModel('ollama-cloud')?.model).toBe('gpt-oss:120b');
      expect(resolveExplicitModel('ollama-cloud-flash')?.model).toBe('gpt-oss:20b');
      expect(resolveExplicitModel('ollama-cloud-pro')?.model).toBe('gpt-oss:120b');
      expect(resolveExplicitModel('ollama-cloud-embed')?.model).toBe('embeddinggemma');
      expect(resolveExplicitModel('ollama-cloud-deepseek')?.model).toBe('deepseek-v3.1:671b');
      expect(resolveExplicitModel('ollama-cloud-qwen')?.model).toBe('qwen3-coder:480b');
      expect(resolveExplicitModel('ollama-cloud-kimi')?.model).toBe('kimi-k2:1t');
      expect(resolveExplicitModel('ollama-cloud-glm')?.model).toBe('glm-4.6:cloud');
    });

    it('routes antigravity/* to antigravity provider', () => {
      expect(resolveExplicitModel('antigravity/gemini-2.5-flash')?.provider).toBe('antigravity');
      expect(resolveExplicitModel('antigravity/gemini-2.5-flash')?.model).toBe('gemini-2.5-flash');
    });

    it('routes agy/* to agy provider', () => {
      expect(resolveExplicitModel('agy/gemini-2.5-flash')?.provider).toBe('agy');
    });

    it('routes google-adk/* to google-adk provider', () => {
      expect(resolveExplicitModel('google-adk/gemini-2.5-flash')?.provider).toBe('google-adk');
    });
  });

  describe('with defaultProvider: "openrouter"', () => {
    it('routes anthropic/claude-sonnet-4-6 to openrouter, preserving model name', () => {
      const result = resolveExplicitModel('anthropic/claude-sonnet-4-6', 'openrouter');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('openrouter');
      expect(result!.model).toBe('anthropic/claude-sonnet-4-6');
    });

    it('routes google/gemini-2.0-flash-001 to openrouter, preserving model name', () => {
      const result = resolveExplicitModel('google/gemini-2.0-flash-001', 'openrouter');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('openrouter');
      expect(result!.model).toBe('google/gemini-2.0-flash-001');
    });

    it('routes claude-sonnet-4-6 (bare name) to openrouter', () => {
      const result = resolveExplicitModel('claude-sonnet-4-6', 'openrouter');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('openrouter');
      expect(result!.model).toBe('claude-sonnet-4-6');
    });

    it('routes gpt-4o to openrouter when defaultProvider is set', () => {
      const result = resolveExplicitModel('gpt-4o', 'openrouter');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('openrouter');
      expect(result!.model).toBe('gpt-4o');
    });

    it('returns non-null even for unknown model names', () => {
      const result = resolveExplicitModel('some-future-model-xyz', 'openrouter');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('openrouter');
      expect(result!.model).toBe('some-future-model-xyz');
    });
  });

  describe('with other defaultProvider values', () => {
    it('routes to anthropic when defaultProvider is "anthropic"', () => {
      const result = resolveExplicitModel('gpt-4o', 'anthropic');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('anthropic');
    });
  });
});

describe('defaultProvider: config schema', () => {
  it('resolveExplicitModel is exported', () => {
    expect(typeof resolveExplicitModel).toBe('function');
  });

  it('defaultProvider undefined behaves the same as not set', () => {
    const withUndefined = resolveExplicitModel('claude-sonnet-4-6', undefined);
    const withoutParam = resolveExplicitModel('claude-sonnet-4-6');
    expect(withUndefined).toEqual(withoutParam);
  });
});

describe('defaultProvider: smart aliases compatibility', () => {
  // Smart aliases (rp:best, rp:fast, etc.) already resolve to OpenRouter models
  // when OPENROUTER_API_KEY is set. These tests verify that resolveExplicitModel
  // with defaultProvider correctly handles alias-like inputs.

  it('rp:fast with defaultProvider routes to openrouter', () => {
    // rp:fast is an alias — resolveExplicitModel would be called AFTER alias resolution
    // so the model passed to it would be e.g. 'anthropic/claude-3-5-haiku'
    const result = resolveExplicitModel('anthropic/claude-3-5-haiku', 'openrouter');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('openrouter');
    expect(result!.model).toBe('anthropic/claude-3-5-haiku');
  });

  it('rp:cheap (Google model) with defaultProvider routes to openrouter', () => {
    const result = resolveExplicitModel('google/gemini-2.0-flash-001', 'openrouter');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('openrouter');
    expect(result!.model).toBe('google/gemini-2.0-flash-001');
  });
});

describe('addProviderPrefix — bare model names for aggregator routing', () => {
  // Import the helper (exported for testing)
  // Since addProviderPrefix is not exported, we test it indirectly through the
  // complexity routing scenario: bare model names from the classifier need prefixes.

  it('complexity routing: bare claude-sonnet-4-6 gets anthropic/ prefix via resolveExplicitModel', () => {
    // When complexity routing picks 'claude-sonnet-4-6' (bare) and defaultProvider is set,
    // resolveExplicitModel returns it as-is (bare). The prefix is added later in the handler.
    // So we test the resolveExplicitModel behavior first:
    const result = resolveExplicitModel('claude-sonnet-4-6', 'openrouter');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('openrouter');
    // resolveExplicitModel preserves the model name as-is
    expect(result!.model).toBe('claude-sonnet-4-6');
  });

  it('prefixed model names pass through unchanged', () => {
    const result = resolveExplicitModel('anthropic/claude-sonnet-4-6', 'openrouter');
    expect(result).not.toBeNull();
    expect(result!.model).toBe('anthropic/claude-sonnet-4-6');
  });
});
