/**
 * Google Antigravity provider — managed agent via Gemini Interactions API (@google/genai).
 *
 * @packageDocumentation
 */

import { GoogleGenAI } from '@google/genai';
import {
  GOOGLE_API_DEFAULTS,
  mapGoogleError,
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
  type GoogleApiKeyConfig,
} from './google-shared.js';
import type { ChatRequestBody } from './shared.js';

export {
  GOOGLE_API_DEFAULTS,
  mapGoogleError,
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
};

export const ANTIGRAVITY_DEFAULTS = {
  defaultAgent: 'antigravity-preview-05-2026',
  defaultEnvironment: 'remote',
  interactionHeader: 'x-antigravity-interaction-id',
  environmentHeader: 'x-antigravity-environment-id',
  timeoutMs: 300_000,
} as const;

export interface AntigravityProviderConfig extends GoogleApiKeyConfig {
  enabled?: boolean;
  agent?: string;
  environment?: string | Record<string, unknown>;
  timeoutMs?: number;
}

function createGenaiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

function extractPrompt(messages: ChatRequestBody['messages']): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser && typeof lastUser.content === 'string') {
    return lastUser.content;
  }
  return messages
    .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n\n');
}

function resolveAgentId(model: string, config?: AntigravityProviderConfig): string {
  const stripped = model.startsWith('antigravity/')
    ? model.slice('antigravity/'.length)
    : model;
  if (stripped && stripped !== model && !stripped.startsWith('gemini')) {
    return stripped;
  }
  return config?.agent ?? ANTIGRAVITY_DEFAULTS.defaultAgent;
}

function interactionToOpenAi(
  interaction: Record<string, unknown>,
  model: string
): Record<string, unknown> {
  const outputText =
    (interaction['output_text'] as string | undefined) ??
    (interaction['outputText'] as string | undefined) ??
    '';

  return {
    id: (interaction['id'] as string | undefined) ?? 'interaction',
    object: 'chat.completion',
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: outputText },
        finish_reason: interaction['status'] === 'requires_action' ? 'tool_calls' : 'stop',
      },
    ],
    antigravity: {
      status: interaction['status'],
      environment_id: interaction['environment_id'] ?? interaction['environmentId'],
      steps: interaction['steps'],
    },
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export async function antigravityCreateInteraction(
  apiKey: string,
  body: Record<string, unknown>,
  config?: AntigravityProviderConfig
) {
  const client = createGenaiClient(apiKey);
  const timeout = config?.timeoutMs ?? ANTIGRAVITY_DEFAULTS.timeoutMs;
  return client.interactions.create(body as never, { timeout });
}

export async function antigravityGetInteraction(
  apiKey: string,
  interactionId: string,
  config?: AntigravityProviderConfig
) {
  const client = createGenaiClient(apiKey);
  const timeout = config?.timeoutMs ?? ANTIGRAVITY_DEFAULTS.timeoutMs;
  return client.interactions.get(interactionId, undefined, { timeout });
}

export async function antigravityCancelInteraction(
  apiKey: string,
  interactionId: string,
  config?: AntigravityProviderConfig
) {
  const client = createGenaiClient(apiKey);
  const timeout = config?.timeoutMs ?? ANTIGRAVITY_DEFAULTS.timeoutMs;
  return client.interactions.cancel(interactionId, undefined, { timeout });
}

export async function forwardToAntigravityChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: AntigravityProviderConfig,
  previousInteractionId?: string,
  environmentId?: string
): Promise<
  | { success: true; data: Record<string, unknown>; interactionId?: string; environmentId?: string }
  | { success: false; error: ReturnType<typeof mapGoogleError> }
> {
  try {
    const client = createGenaiClient(apiKey);
    const agent = resolveAgentId(targetModel, config);
    const timeout = config?.timeoutMs ?? ANTIGRAVITY_DEFAULTS.timeoutMs;

    const payload: Record<string, unknown> = {
      agent,
      input: extractPrompt(request.messages),
      store: true,
      ...(config?.environment ?? environmentId
        ? { environment: environmentId ?? config?.environment ?? ANTIGRAVITY_DEFAULTS.defaultEnvironment }
        : { environment: ANTIGRAVITY_DEFAULTS.defaultEnvironment }),
      ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
      ...(request.tools?.length ? { tools: request.tools } : {}),
    };

    const interaction = (await client.interactions.create(payload as never, { timeout })) as Record<
      string,
      unknown
    >;

    return {
      success: true,
      data: interactionToOpenAi(interaction, agent),
      interactionId: interaction['id'] as string | undefined,
      environmentId: (interaction['environment_id'] ?? interaction['environmentId']) as string | undefined,
    };
  } catch (err) {
    return { success: false, error: mapGoogleError(err, 'Antigravity Interactions API error') };
  }
}

export async function forwardToAntigravityChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: AntigravityProviderConfig,
  previousInteractionId?: string,
  environmentId?: string
): Promise<
  | { success: true; stream: AsyncIterable<unknown>; interactionId?: string }
  | { success: false; error: ReturnType<typeof mapGoogleError> }
> {
  try {
    const client = createGenaiClient(apiKey);
    const agent = resolveAgentId(targetModel, config);
    const timeout = config?.timeoutMs ?? ANTIGRAVITY_DEFAULTS.timeoutMs;

    const payload: Record<string, unknown> = {
      agent,
      input: extractPrompt(request.messages),
      stream: true,
      store: true,
      environment: environmentId ?? config?.environment ?? ANTIGRAVITY_DEFAULTS.defaultEnvironment,
      ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
    };

    const stream = (await client.interactions.create(payload as never, {
      timeout,
    })) as unknown as AsyncIterable<unknown>;
    return { success: true, stream };
  } catch (err) {
    return { success: false, error: mapGoogleError(err, 'Antigravity streaming error') };
  }
}

export function mapAntigravityError(err: unknown) {
  return mapGoogleError(err, 'Antigravity agent error — see https://ai.google.dev/gemini-api/docs/antigravity-agent');
}
