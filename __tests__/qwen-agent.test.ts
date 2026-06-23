/**
 * Qwen Agent SDK provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  extractTextDeltaFromPartialMessage,
  extractTextFromContentBlocks,
  partialMessageToSseChunk,
  usageToOpenAi,
  mapQwenAgentError,
  buildQwenQueryOptions,
  extractQwenAgentPrompt,
  QWEN_AGENT_DEFAULTS,
} from '../src/providers/qwen-agent.js';

describe('extractTextFromContentBlocks', () => {
  it('extracts text blocks', () => {
    expect(
      extractTextFromContentBlocks([
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'Qwen' },
      ])
    ).toBe('Hello\nQwen');
  });
});

describe('extractTextDeltaFromPartialMessage', () => {
  it('extracts text_delta from partial assistant events', () => {
    const delta = extractTextDeltaFromPartialMessage({
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello Qwen' },
      },
    });
    expect(delta).toBe('Hello Qwen');
  });

  it('ignores non-text deltas', () => {
    const delta = extractTextDeltaFromPartialMessage({
      event: { type: 'content_block_delta', delta: { type: 'input_json_delta' } },
    });
    expect(delta).toBe('');
  });
});

describe('usageToOpenAi', () => {
  it('maps SDK usage fields', () => {
    const openAi = usageToOpenAi({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 10,
    });
    expect(openAi.prompt_tokens).toBe(100);
    expect(openAi.completion_tokens).toBe(50);
    expect(openAi.total_tokens).toBe(150);
    expect(openAi.cache_read_input_tokens).toBe(20);
  });
});

describe('partialMessageToSseChunk', () => {
  it('converts delta to OpenAI SSE chunk', () => {
    const chunk = partialMessageToSseChunk('delta', 'id-1', 'qwen-agent/qwen-plus', 123);
    expect(chunk).toContain('chat.completion.chunk');
    expect(chunk).toContain('"delta"');
  });
});

describe('buildQwenQueryOptions', () => {
  it('maps approveAllTools to yolo permission mode', () => {
    const opts = buildQwenQueryOptions({ approveAllTools: true }, 'qwen-plus', '/tmp', null, null, false);
    expect(opts.permissionMode).toBe('yolo');
  });

  it('uses explicit permissionMode when set', () => {
    const opts = buildQwenQueryOptions(
      { permissionMode: 'plan', approveAllTools: true },
      'qwen-plus',
      '/tmp',
      null,
      null,
      false
    );
    expect(opts.permissionMode).toBe('plan');
  });
});

describe('extractQwenAgentPrompt', () => {
  it('combines system and last user message', () => {
    const prompt = extractQwenAgentPrompt([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(prompt).toContain('You are helpful');
    expect(prompt).toContain('Hi');
  });
});

describe('mapQwenAgentError', () => {
  it('maps CLI spawn errors', () => {
    const mapped = mapQwenAgentError(new Error('spawn qwen ENOENT'));
    expect(mapped.status).toBe(502);
    expect(mapped.hint.toLowerCase()).toContain('cli');
  });

  it('maps timeout errors', () => {
    const mapped = mapQwenAgentError(new Error('timed out waiting for query'));
    expect(mapped.status).toBe(504);
  });

  it('maps auth errors', () => {
    const mapped = mapQwenAgentError(new Error('401 unauthorized'));
    expect(mapped.status).toBe(401);
    expect(mapped.hint).toContain('DASHSCOPE_API_KEY');
  });
});

describe('defaults', () => {
  it('exposes sticky session headers', () => {
    expect(QWEN_AGENT_DEFAULTS.sessionHeader).toBe('x-qwen-session-id');
    expect(QWEN_AGENT_DEFAULTS.workDirHeader).toBe('x-qwen-work-dir');
  });
});
