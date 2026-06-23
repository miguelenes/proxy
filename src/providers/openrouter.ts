/**
 * OpenRouter provider — dedicated forwarding via @openrouter/sdk with usage mapping,
 * error normalization, and metadata client helpers.
 *
 * @packageDocumentation
 */

import { OpenRouter } from '@openrouter/sdk';
import type { ChatRequest } from '@openrouter/sdk/models/chatrequest.js';
import type { ChatResult } from '@openrouter/sdk/models/chatresult.js';
import type { ChatStreamChunk } from '@openrouter/sdk/models/chatstreamchunk.js';
import type { ChatUsage } from '@openrouter/sdk/models/chatusage.js';
import type { ProvidersConfigMap } from './registry.js';
import { getProviderEndpoint } from './registry.js';
import type { ChatRequestBody } from './shared.js';

export const OPENROUTER_DEFAULTS = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  httpRefererEnv: 'OPENROUTER_HTTP_REFERER',
  appTitleEnv: 'OPENROUTER_APP_TITLE',
  appCategoriesEnv: 'OPENROUTER_APP_CATEGORIES',
} as const;

export interface OpenRouterProviderConfig {
  enabled?: boolean;
  apiKeyEnv?: string;
  baseUrl?: string;
  httpReferer?: string;
  appTitle?: string;
  appCategories?: string;
  timeoutMs?: number;
}

export interface OpenRouterForwardOptions {
  providersConfig?: ProvidersConfigMap;
  attribution?: {
    httpReferer?: string;
    appTitle?: string;
    appCategories?: string;
  };
}

export interface NormalizedOpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  cost?: number;
}

const SNAKE_TO_CAMEL: Record<string, string> = {
  max_tokens: 'maxTokens',
  max_completion_tokens: 'maxCompletionTokens',
  tool_choice: 'toolChoice',
  frequency_penalty: 'frequencyPenalty',
  presence_penalty: 'presencePenalty',
  top_p: 'topP',
  top_k: 'topK',
  response_format: 'responseFormat',
  parallel_tool_calls: 'parallelToolCalls',
  logit_bias: 'logitBias',
  min_p: 'minP',
  repetition_penalty: 'repetitionPenalty',
  reasoning_effort: 'reasoningEffort',
};

function resolveBaseUrl(providersConfig?: ProvidersConfigMap): string {
  const endpoint = getProviderEndpoint('openrouter', providersConfig);
  return (endpoint.baseUrl || OPENROUTER_DEFAULTS.baseUrl).replace(/\/$/, '');
}

function resolveAttribution(
  config?: OpenRouterProviderConfig,
  override?: OpenRouterForwardOptions['attribution']
): { httpReferer?: string; appTitle?: string; appCategories?: string } {
  return {
    httpReferer:
      override?.httpReferer ??
      config?.httpReferer ??
      process.env[OPENROUTER_DEFAULTS.httpRefererEnv],
    appTitle:
      override?.appTitle ??
      config?.appTitle ??
      process.env[OPENROUTER_DEFAULTS.appTitleEnv],
    appCategories:
      override?.appCategories ??
      config?.appCategories ??
      process.env[OPENROUTER_DEFAULTS.appCategoriesEnv],
  };
}

export function createOpenRouterClient(
  apiKey: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
): OpenRouter {
  const baseUrl = config?.baseUrl ?? resolveBaseUrl(providersConfig);
  const attribution = resolveAttribution(config);
  return new OpenRouter({
    apiKey,
    serverURL: baseUrl,
    ...(config?.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    ...(attribution.httpReferer ? { httpReferer: attribution.httpReferer } : {}),
    ...(attribution.appTitle ? { appTitle: attribution.appTitle } : {}),
    ...(attribution.appCategories ? { appCategories: attribution.appCategories } : {}),
  });
}

export function resolveOpenRouterToken(config?: OpenRouterProviderConfig): string | null {
  if (config?.apiKeyEnv) {
    const fromCustom = process.env[config.apiKeyEnv];
    if (fromCustom?.trim()) {
      return fromCustom.trim();
    }
  }
  const key = process.env[OPENROUTER_DEFAULTS.apiKeyEnv];
  return key?.trim() ? key.trim() : null;
}

function buildChatRequest(
  request: ChatRequestBody,
  targetModel: string,
  stream: boolean
): ChatRequest {
  const body: Record<string, unknown> = { ...request, model: targetModel, stream };

  for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
    if (snake in body && body[camel] === undefined) {
      body[camel] = body[snake];
      delete body[snake];
    }
  }

  return body as ChatRequest;
}

function toOpenAiUsage(usage?: ChatUsage): Record<string, unknown> | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    ...(usage.promptTokensDetails
      ? {
          prompt_tokens_details: {
            cached_tokens: usage.promptTokensDetails.cachedTokens ?? 0,
            cache_write_tokens: usage.promptTokensDetails.cacheWriteTokens,
            audio_tokens: usage.promptTokensDetails.audioTokens,
            video_tokens: usage.promptTokensDetails.videoTokens,
          },
        }
      : {}),
    ...(usage.completionTokensDetails
      ? {
          completion_tokens_details: {
            reasoning_tokens: usage.completionTokensDetails.reasoningTokens,
            audio_tokens: usage.completionTokensDetails.audioTokens,
          },
        }
      : {}),
    ...(usage.cost != null ? { cost: usage.cost } : {}),
    ...(usage.isByok != null ? { is_byok: usage.isByok } : {}),
    ...(usage.costDetails ? { cost_details: usage.costDetails } : {}),
  };
}

export function toOpenAiChatCompletion(result: ChatResult): Record<string, unknown> {
  return {
    id: result.id,
    object: 'chat.completion',
    created: result.created,
    model: result.model,
    choices: result.choices.map((choice) => ({
      index: choice.index,
      message: choice.message,
      finish_reason: choice.finishReason,
      ...(choice.logprobs ? { logprobs: choice.logprobs } : {}),
    })),
    system_fingerprint: result.systemFingerprint,
    ...(result.usage ? { usage: toOpenAiUsage(result.usage) } : {}),
    ...(result.openrouterMetadata ? { openrouter_metadata: result.openrouterMetadata } : {}),
  };
}

export function toOpenAiStreamChunk(chunk: ChatStreamChunk): Record<string, unknown> {
  return {
    id: chunk.id,
    object: chunk.object,
    created: chunk.created,
    model: chunk.model,
    choices: chunk.choices.map((choice) => ({
      index: choice.index,
      delta: choice.delta,
      finish_reason: choice.finishReason,
      ...(choice.logprobs ? { logprobs: choice.logprobs } : {}),
    })),
    ...(chunk.systemFingerprint ? { system_fingerprint: chunk.systemFingerprint } : {}),
    ...(chunk.usage ? { usage: toOpenAiUsage(chunk.usage) } : {}),
    ...(chunk.openrouterMetadata ? { openrouter_metadata: chunk.openrouterMetadata } : {}),
    ...(chunk.error ? { error: chunk.error } : {}),
  };
}

export function mapOpenRouterUsage(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  cost?: number;
}): NormalizedOpenRouterUsage {
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage.total_tokens ?? prompt + completion,
    cached_tokens: cached,
    ...(usage.cost != null ? { cost: usage.cost } : {}),
  };
}

export function mapOpenRouterUsageFromSdk(usage?: ChatUsage): NormalizedOpenRouterUsage {
  if (!usage) {
    return {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cached_tokens: 0,
    };
  }
  return mapOpenRouterUsage({
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    prompt_tokens_details: {
      cached_tokens: usage.promptTokensDetails?.cachedTokens,
    },
    cost: usage.cost ?? undefined,
  });
}

export function mapOpenRouterError(
  err: unknown
): { error: string; hint: string; status: number } {
  if (isOpenRouterError(err)) {
    let body: unknown = err.body;
    try {
      body = JSON.parse(err.body);
    } catch {
      // keep raw body string
    }
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : typeof body === 'object' && body !== null && 'message' in body
          ? String((body as { message: unknown }).message)
          : err.message;

    const hints: Record<number, string> = {
      400: 'Invalid request — check model id and parameters',
      401: 'Authentication failed — verify OPENROUTER_API_KEY',
      402: 'Insufficient credits — top up at openrouter.ai/settings/credits',
      403: 'Forbidden — check API key permissions or guardrails',
      408: 'Request timed out — retry or increase timeoutMs',
      413: 'Payload too large — reduce context size',
      422: 'Invalid parameters for the selected model',
      429: 'Rate limited — back off and retry',
      502: 'Provider error — try a fallback model via models[]',
      503: 'Service unavailable — retry shortly',
    };

    return {
      error: message,
      hint: hints[err.statusCode] ?? 'OpenRouter API error',
      status: err.statusCode,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    error: message,
    hint: 'OpenRouter SDK error — verify API key and request shape',
    status: 502,
  };
}

function isOpenRouterError(err: unknown): err is { statusCode: number; body: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number' &&
    'body' in err &&
    typeof (err as { body: unknown }).body === 'string'
  );
}

function errorResponse(mapped: { error: string; hint: string; status: number }): Response {
  return new Response(JSON.stringify(mapped), {
    status: mapped.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamToSseResponse(stream: AsyncIterable<ChatStreamChunk>): Response {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of stream) {
          const payload = toOpenAiStreamChunk(chunk);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function buildSendOptions(
  config?: OpenRouterProviderConfig,
  opts?: OpenRouterForwardOptions
) {
  const attribution = resolveAttribution(config, opts?.attribution);
  return {
    ...(attribution.httpReferer ? { httpReferer: attribution.httpReferer } : {}),
    ...(attribution.appTitle ? { appTitle: attribution.appTitle } : {}),
    ...(attribution.appCategories ? { appCategories: attribution.appCategories } : {}),
  };
}

export async function forwardToOpenRouterChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: OpenRouterForwardOptions = {}
): Promise<Response> {
  const config = opts.providersConfig?.['openrouter'] as OpenRouterProviderConfig | undefined;
  const client = createOpenRouterClient(apiKey, config, opts.providersConfig);
  const chatRequest = buildChatRequest(request, targetModel, false);

  try {
    const result = await client.chat.send({
      chatRequest: { ...chatRequest, stream: false },
      ...buildSendOptions(config, opts),
    });
    return new Response(JSON.stringify(toOpenAiChatCompletion(result as ChatResult)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(mapOpenRouterError(err));
  }
}

export async function forwardToOpenRouterChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: OpenRouterForwardOptions = {}
): Promise<Response> {
  const config = opts.providersConfig?.['openrouter'] as OpenRouterProviderConfig | undefined;
  const client = createOpenRouterClient(apiKey, config, opts.providersConfig);
  const chatRequest = buildChatRequest(request, targetModel, true);

  try {
    const stream = (await client.chat.send({
      chatRequest: { ...chatRequest, stream: true },
      ...buildSendOptions(config, opts),
    })) as AsyncIterable<ChatStreamChunk>;
    return streamToSseResponse(stream);
  } catch (err) {
    return errorResponse(mapOpenRouterError(err));
  }
}

// --- Metadata SDK wrappers ---

export async function openRouterListModels(
  apiKey: string,
  query?: Record<string, string | undefined>,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.models.list(query as Parameters<OpenRouter['models']['list']>[0]);
}

export async function openRouterModelsCount(
  apiKey: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.models.count();
}

export async function openRouterGetModel(
  apiKey: string,
  author: string,
  slug: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.models.get({ author, slug, ...resolveAttribution(config) });
}

export async function openRouterGetCredits(
  apiKey: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.credits.getCredits(resolveAttribution(config));
}

export async function openRouterGetGeneration(
  apiKey: string,
  id: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.generations.getGeneration({ id, ...resolveAttribution(config) });
}

export async function openRouterListGenerationContent(
  apiKey: string,
  id: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.generations.listGenerationContent({ id, ...resolveAttribution(config) });
}

export async function openRouterCreateEmbeddings(
  apiKey: string,
  body: Record<string, unknown>,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.embeddings.generate({
    requestBody: body as import('@openrouter/sdk/models/operations/createembeddings.js').CreateEmbeddingsRequestBody,
    ...resolveAttribution(config),
  });
}

export async function openRouterListEmbeddingModels(
  apiKey: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.embeddings.listModels(resolveAttribution(config));
}

export async function openRouterListProviders(
  apiKey: string,
  config?: OpenRouterProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = createOpenRouterClient(apiKey, config, providersConfig);
  return client.providers.list(resolveAttribution(config));
}

export function parseOpenRouterModelSlug(modelPath: string): { author: string; slug: string } | null {
  const trimmed = modelPath.replace(/^\/+/, '').trim();
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash === trimmed.length - 1) {
    return null;
  }
  return {
    author: trimmed.slice(0, slash),
    slug: trimmed.slice(slash + 1),
  };
}
