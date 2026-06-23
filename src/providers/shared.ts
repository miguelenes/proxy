/**
 * Shared provider forwarding helpers (OpenAI-compatible, Azure Foundry).
 *
 * @packageDocumentation
 */

import {
  DEFAULT_ENDPOINTS,
  getProviderEndpoint,
  type ProvidersConfigMap,
} from './registry.js';

export interface ChatRequestBody {
  model: string;
  messages: Array<{ role: string; content: string | unknown }>;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

export function buildChatCompletionsUrl(baseUrl: string, apiVersion?: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  if (apiVersion) {
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}/chat/completions${sep}api-version=${encodeURIComponent(apiVersion)}`;
  }
  return `${trimmed}/chat/completions`;
}

/**
 * Forward to an OpenAI-compatible provider using resolved endpoint config.
 */
export async function forwardOpenAiCompatible(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  provider: string,
  providersConfig?: ProvidersConfigMap,
  stream = false
): Promise<Response> {
  const endpoint = getProviderEndpoint(provider, providersConfig);
  const fallback = DEFAULT_ENDPOINTS['openrouter']?.baseUrl ?? 'https://openrouter.ai/api/v1';
  const baseUrl = endpoint.baseUrl || fallback;

  const compatBody = {
    ...request,
    model: targetModel,
    stream,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (endpoint.authStyle === 'api-key') {
    headers['api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return fetch(buildChatCompletionsUrl(baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(compatBody),
  });
}

/**
 * Azure AI Foundry — legacy OpenAI v1 route with api-key header and api-version query.
 */
export async function forwardAzureFoundryLegacy(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  providersConfig?: ProvidersConfigMap,
  stream = false,
  apiVersion = 'v1'
): Promise<Response> {
  const endpoint = getProviderEndpoint('azure-foundry', providersConfig);
  if (!endpoint.baseUrl) {
    return new Response(
      JSON.stringify({
        error: 'Azure Foundry base URL not configured',
        hint: 'Set providers.azure-foundry.baseUrl to https://{resource}.openai.azure.com/openai/v1 in ~/.trestle/config.json',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const compatBody = { ...request, model: targetModel, stream };
  const url = buildChatCompletionsUrl(endpoint.baseUrl.replace(/\/$/, ''), apiVersion);

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(compatBody),
  });
}
