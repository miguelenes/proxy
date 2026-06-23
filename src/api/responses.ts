/**
 * OpenAI Responses API (/v1/responses) — translation layer for Codex CLI.
 *
 * Codex requires wire_api = "responses". This module converts between
 * Responses and Chat Completions formats.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';

export interface ResponsesRequestBody {
  model: string;
  input?: string | unknown[] | Record<string, unknown>;
  instructions?: string;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  tools?: unknown[];
  [key: string]: unknown;
}

export interface ChatRequestLike {
  model: string;
  messages: Array<{ role: string; content: string | unknown }>;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  tools?: unknown[];
  [key: string]: unknown;
}

/**
 * Convert OpenAI Responses request body to Chat Completions format.
 */
export function responsesToChatRequest(body: ResponsesRequestBody): ChatRequestLike {
  const messages: Array<{ role: string; content: string | unknown }> = [];

  if (body.instructions) {
    messages.push({ role: 'system', content: body.instructions });
  }

  const input = body.input;
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        messages.push({ role: 'user', content: item });
        continue;
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (obj['role'] && obj['content'] !== undefined) {
          messages.push({
            role: String(obj['role']),
            content: obj['content'] as string | unknown,
          });
          continue;
        }
        if (obj['type'] === 'message' && obj['role'] && obj['content']) {
          messages.push({
            role: String(obj['role']),
            content: obj['content'] as string | unknown,
          });
          continue;
        }
        messages.push({ role: 'user', content: JSON.stringify(item) });
      }
    }
  } else if (input && typeof input === 'object') {
    messages.push({ role: 'user', content: JSON.stringify(input) });
  }

  if (messages.length === 0) {
    messages.push({ role: 'user', content: '' });
  }

  return {
    model: body.model,
    messages,
    stream: body.stream,
    max_tokens: body.max_output_tokens,
    temperature: body.temperature,
    tools: body.tools,
  };
}

/**
 * Convert Chat Completions JSON response to OpenAI Responses format.
 */
export function chatCompletionToResponse(
  completion: Record<string, unknown>,
  model: string
): Record<string, unknown> {
  const id = (completion['id'] as string) ?? `resp_${randomUUID().replace(/-/g, '')}`;
  const choices = completion['choices'] as Array<Record<string, unknown>> | undefined;
  const first = choices?.[0];
  const message = first?.['message'] as Record<string, unknown> | undefined;
  const text =
    typeof message?.['content'] === 'string'
      ? message['content']
      : '';

  const usage = completion['usage'] as Record<string, number> | undefined;

  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: (completion['model'] as string) ?? model,
    output: [
      {
        type: 'message',
        id: `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: usage
      ? {
          input_tokens: usage['prompt_tokens'] ?? 0,
          output_tokens: usage['completion_tokens'] ?? 0,
          total_tokens: usage['total_tokens'] ?? 0,
        }
      : undefined,
  };
}

/**
 * Build SSE chunks for streaming Responses API from OpenAI chat completion stream lines.
 */
export function* chatStreamLineToResponsesEvents(
  line: string,
  responseId: string,
  model: string
): Generator<string> {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]') {
    if (trimmed === 'data: [DONE]') {
      yield `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { id: responseId, status: 'completed' } })}\n\n`;
    }
    return;
  }
  if (!trimmed.startsWith('data: ')) return;

  try {
    const payload = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
    const choices = payload['choices'] as Array<Record<string, unknown>> | undefined;
    const delta = choices?.[0]?.['delta'] as Record<string, unknown> | undefined;
    const content = delta?.['content'];
    if (typeof content === 'string' && content.length > 0) {
      yield `event: response.output_text.delta\ndata: ${JSON.stringify({
        type: 'response.output_text.delta',
        item_id: responseId,
        output_index: 0,
        content_index: 0,
        delta: content,
      })}\n\n`;
    }
    const reasoning = delta?.['reasoning_content'];
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      yield `event: response.reasoning.delta\ndata: ${JSON.stringify({
        type: 'response.reasoning.delta',
        item_id: responseId,
        output_index: 0,
        delta: reasoning,
      })}\n\n`;
    }
  } catch {
    // ignore malformed SSE
  }
}

export function responsesStreamPreamble(responseId: string, model: string): string {
  return `event: response.created\ndata: ${JSON.stringify({
    type: 'response.created',
    response: { id: responseId, object: 'response', status: 'in_progress', model },
  })}\n\n`;
}
