/**
 * Kimi Agent SDK provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  extractTextDeltaFromEvent,
  extractTokenUsageFromEvent,
  streamEventToSseChunk,
  tokenUsageToOpenAi,
  mapKimiAgentError,
} from '../src/providers/kimi-agent.js';
import type { StreamEvent } from '@moonshot-ai/kimi-agent-sdk/schema';

describe('extractTextDeltaFromEvent', () => {
  it('extracts text from ContentPart events', () => {
    const event = {
      type: 'ContentPart',
      payload: { type: 'text', text: 'Hello Kimi' },
    } as StreamEvent;
    expect(extractTextDeltaFromEvent(event)).toBe('Hello Kimi');
  });

  it('ignores non-text parts', () => {
    const event = {
      type: 'ContentPart',
      payload: { type: 'think', think: 'reasoning' },
    } as StreamEvent;
    expect(extractTextDeltaFromEvent(event)).toBe('');
  });
});

describe('extractTokenUsageFromEvent', () => {
  it('reads token_usage from StatusUpdate', () => {
    const event = {
      type: 'StatusUpdate',
      payload: {
        token_usage: {
          input_other: 100,
          output: 50,
          input_cache_read: 20,
          input_cache_creation: 10,
        },
      },
    } as StreamEvent;
    const usage = extractTokenUsageFromEvent(event);
    expect(usage?.output).toBe(50);
    expect(usage?.input_other).toBe(100);
  });
});

describe('tokenUsageToOpenAi', () => {
  it('sums input token fields', () => {
    const openAi = tokenUsageToOpenAi({
      input_other: 100,
      output: 50,
      input_cache_read: 20,
      input_cache_creation: 10,
    });
    expect(openAi.prompt_tokens).toBe(130);
    expect(openAi.completion_tokens).toBe(50);
    expect(openAi.total_tokens).toBe(180);
  });
});

describe('streamEventToSseChunk', () => {
  it('converts ContentPart to OpenAI SSE chunk', () => {
    const event = {
      type: 'ContentPart',
      payload: { type: 'text', text: 'delta' },
    } as StreamEvent;
    const chunk = streamEventToSseChunk(event, 'id-1', 'kimi-agent/kimi-latest', 123);
    expect(chunk).toContain('chat.completion.chunk');
    expect(chunk).toContain('"delta"');
  });
});

describe('mapKimiAgentError', () => {
  it('maps CLI not found style errors', () => {
    const mapped = mapKimiAgentError(new Error('spawn kimi ENOENT'));
    expect(mapped.status).toBe(502);
    expect(mapped.hint.toLowerCase()).toContain('cli');
  });

  it('maps timeout errors', () => {
    const mapped = mapKimiAgentError(new Error('timed out waiting for turn'));
    expect(mapped.status).toBe(504);
  });
});
