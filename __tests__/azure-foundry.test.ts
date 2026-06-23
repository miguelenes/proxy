/**
 * Azure AI Foundry provider tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  isFoundrySdkMode,
  resolveProjectEndpoint,
  mapFoundryError,
  FOUNDRY_DEFAULTS,
} from '../src/providers/azure-foundry.js';
import { forwardAzureFoundryLegacy, buildChatCompletionsUrl } from '../src/providers/shared.js';
import { resolveExplicitModel } from '../src/standalone-proxy.js';

describe('resolveProjectEndpoint', () => {
  const prevEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;

  afterEach(() => {
    if (prevEndpoint === undefined) {
      delete process.env.FOUNDRY_PROJECT_ENDPOINT;
    } else {
      process.env.FOUNDRY_PROJECT_ENDPOINT = prevEndpoint;
    }
  });

  it('reads FOUNDRY_PROJECT_ENDPOINT', () => {
    process.env.FOUNDRY_PROJECT_ENDPOINT = 'https://acct.services.ai.azure.com/api/projects/p1';
    expect(resolveProjectEndpoint()).toBe('https://acct.services.ai.azure.com/api/projects/p1');
  });

  it('prefers config projectEndpoint', () => {
    process.env.FOUNDRY_PROJECT_ENDPOINT = 'https://env.example/api/projects/env';
    expect(
      resolveProjectEndpoint({ projectEndpoint: 'https://cfg.example/api/projects/cfg' })
    ).toBe('https://cfg.example/api/projects/cfg');
  });
});

describe('isFoundrySdkMode', () => {
  it('is false without project endpoint', () => {
    expect(isFoundrySdkMode()).toBe(false);
  });

  it('is true when projectEndpoint is set', () => {
    expect(isFoundrySdkMode({ projectEndpoint: 'https://x.services.ai.azure.com/api/projects/p' })).toBe(
      true
    );
  });
});

describe('mapFoundryError', () => {
  it('maps unauthorized to 401', () => {
    const mapped = mapFoundryError(new Error('401 Unauthorized'));
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('az login');
  });
});

describe('legacy Azure URL builder', () => {
  it('appends api-version for Azure', () => {
    const url = buildChatCompletionsUrl('https://r.openai.azure.com/openai/v1', 'v1');
    expect(url).toContain('/chat/completions');
    expect(url).toContain('api-version=v1');
  });
});

describe('resolveExplicitModel azure-foundry', () => {
  it('resolves azure-foundry prefix', () => {
    expect(resolveExplicitModel('azure-foundry/gpt-4o')?.provider).toBe('azure-foundry');
    expect(resolveExplicitModel('azure-foundry/gpt-4o')?.model).toBe('gpt-4o');
  });
});

describe('FOUNDRY_DEFAULTS', () => {
  it('exposes session headers', () => {
    expect(FOUNDRY_DEFAULTS.conversationHeader).toBe('x-foundry-conversation-id');
    expect(FOUNDRY_DEFAULTS.agentNameHeader).toBe('x-foundry-agent-name');
  });
});

describe('forwardAzureFoundryLegacy', () => {
  it('returns 400 when baseUrl missing', async () => {
    const response = await forwardAzureFoundryLegacy(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      'gpt-4o',
      'test-key',
      {},
      false
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('base URL');
  });
});
