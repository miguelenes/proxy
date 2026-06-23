/**
 * OpenCode Go cloud provider — multi-protocol forwarding to opencode.ai/zen/go/v1.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from './registry.js';
import type { ChatRequestBody } from './shared.js';
import {
  OPENCODE_GO_DEFAULTS,
  mapOpencodeError,
  resolveOpencodeGoToken,
  resolveOpencodeTokenFromBearer,
} from './opencode-routing.js';
import {
  forwardToOpencodeZenChat,
  forwardToOpencodeZenChatStream,
  forwardToOpencodeZenMessages,
  forwardToOpencodeZenResponses,
  listOpencodeZenModels,
  mapOpencodeZenUsage,
  type OpencodeZenProviderConfig,
} from './opencode-zen.js';

export {
  OPENCODE_GO_DEFAULTS,
  parseOpencodeModelName,
  resolveOpencodeProtocol,
  buildOpencodeUpstreamUrl,
  resolveOpencodeGoToken,
  resolveOpencodeTokenFromBearer,
  mapOpencodeUsage,
} from './opencode-routing.js';

export type OpencodeGoProviderConfig = OpencodeZenProviderConfig;

const GO_OPTIONS = (providersConfig?: ProvidersConfigMap) => ({
  providersConfig,
  tier: 'go' as const,
});

export async function forwardToOpencodeGoChat(
  request: ChatRequestBody,
  modelId: string,
  apiKey: string,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return forwardToOpencodeZenChat(request, modelId, apiKey, GO_OPTIONS(providersConfig));
}

export async function forwardToOpencodeGoChatStream(
  request: ChatRequestBody,
  modelId: string,
  apiKey: string,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return forwardToOpencodeZenChatStream(request, modelId, apiKey, GO_OPTIONS(providersConfig));
}

export async function forwardToOpencodeGoMessages(
  body: Record<string, unknown>,
  modelId: string,
  apiKey: string,
  stream: boolean,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return forwardToOpencodeZenMessages(body, modelId, apiKey, stream, GO_OPTIONS(providersConfig));
}

export async function forwardToOpencodeGoResponses(
  body: Record<string, unknown>,
  modelId: string,
  apiKey: string,
  stream: boolean,
  providersConfig?: ProvidersConfigMap
): Promise<Response> {
  return forwardToOpencodeZenResponses(body, modelId, apiKey, stream, GO_OPTIONS(providersConfig));
}

export async function listOpencodeGoModels(
  apiKey?: string | null,
  providersConfig?: ProvidersConfigMap
): Promise<unknown> {
  return listOpencodeZenModels(apiKey, GO_OPTIONS(providersConfig));
}

export function mapOpencodeGoError(err: unknown) {
  return mapOpencodeError(err, 'go');
}

export function mapOpencodeGoUsage(usage: Record<string, unknown> | undefined) {
  return mapOpencodeZenUsage(usage);
}
