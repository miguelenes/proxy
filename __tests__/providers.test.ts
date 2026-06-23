/**
 * Provider registry and endpoint resolution tests.
 */
import { describe, it, expect } from 'vitest';
import {
  getProviderEndpoint,
  DEFAULT_ENDPOINTS,
  isOpenAiCompatibleProvider,
  buildChatCompletionsUrl,
} from '../src/providers/index.js';
import {
  responsesToChatRequest,
  chatCompletionToResponse,
} from '../src/api/responses.js';

describe('getProviderEndpoint', () => {
  it('returns default NVIDIA endpoint', () => {
    const ep = getProviderEndpoint('nvidia');
    expect(ep.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
    expect(ep.apiKeyEnv).toBe('NVIDIA_API_KEY');
  });

  it('merges config baseUrl override', () => {
    const ep = getProviderEndpoint('azure-foundry', {
      'azure-foundry': { baseUrl: 'https://myresource.openai.azure.com/openai/v1' },
    });
    expect(ep.baseUrl).toBe('https://myresource.openai.azure.com/openai/v1');
    expect(ep.authStyle).toBe('api-key');
  });
});

describe('isOpenAiCompatibleProvider', () => {
  it('includes mistral but not deepseek, zai, ollama-cloud, or nvidia (dedicated modules)', () => {
    expect(isOpenAiCompatibleProvider('deepseek')).toBe(false);
    expect(isOpenAiCompatibleProvider('zai')).toBe(false);
    expect(isOpenAiCompatibleProvider('ollama-cloud')).toBe(false);
    expect(isOpenAiCompatibleProvider('nvidia')).toBe(false);
    expect(isOpenAiCompatibleProvider('mistral')).toBe(true);
    expect(isOpenAiCompatibleProvider('anthropic')).toBe(false);
  });
});

describe('buildChatCompletionsUrl', () => {
  it('appends api-version for Azure', () => {
    const url = buildChatCompletionsUrl('https://r.openai.azure.com/openai/v1', 'v1');
    expect(url).toContain('/chat/completions');
    expect(url).toContain('api-version=v1');
  });
});

describe('responses API translation', () => {
  it('converts string input to chat messages', () => {
    const chat = responsesToChatRequest({
      model: 'gpt-4o-mini',
      input: 'Hello',
      instructions: 'Be concise',
    });
    expect(chat.model).toBe('gpt-4o-mini');
    expect(chat.messages[0]?.role).toBe('system');
    expect(chat.messages[1]?.role).toBe('user');
    expect(chat.messages[1]?.content).toBe('Hello');
  });

  it('converts chat completion to responses format', () => {
    const resp = chatCompletionToResponse(
      {
        id: 'chatcmpl-1',
        model: 'gpt-4o-mini',
        choices: [{ message: { role: 'assistant', content: 'Hi there' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      },
      'gpt-4o-mini'
    );
    expect(resp['object']).toBe('response');
    expect(resp['status']).toBe('completed');
    const output = resp['output'] as Array<{ content: Array<{ text: string }> }>;
    expect(output[0]?.content[0]?.text).toBe('Hi there');
  });
});

describe('DEFAULT_ENDPOINTS regression', () => {
  it('deepseek uses api.deepseek.com without /v1 suffix', () => {
    expect(DEFAULT_ENDPOINTS['deepseek']?.baseUrl).toBe('https://api.deepseek.com');
  });

  it('groq uses api.groq.com', () => {
    expect(DEFAULT_ENDPOINTS['groq']?.baseUrl).toBe('https://api.groq.com/openai/v1');
  });

  it('zai uses api.z.ai paas v4 base', () => {
    expect(DEFAULT_ENDPOINTS['zai']?.baseUrl).toBe('https://api.z.ai/api/paas/v4');
    expect(DEFAULT_ENDPOINTS['zai']?.apiKeyEnv).toBe('ZAI_API_KEY');
  });

  it('ollama-cloud uses ollama.com/v1 for OpenAI-compat chat', () => {
    expect(DEFAULT_ENDPOINTS['ollama-cloud']?.baseUrl).toBe('https://ollama.com/v1');
    expect(DEFAULT_ENDPOINTS['ollama-cloud']?.apiKeyEnv).toBe('OLLAMA_API_KEY');
  });

  it('nvidia uses integrate.api.nvidia.com/v1', () => {
    expect(DEFAULT_ENDPOINTS['nvidia']?.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
    expect(DEFAULT_ENDPOINTS['nvidia']?.apiKeyEnv).toBe('NVIDIA_API_KEY');
  });
});
