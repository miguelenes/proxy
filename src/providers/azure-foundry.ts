/**
 * Azure AI Foundry provider — @azure/ai-projects SDK with dual auth (Entra SDK + legacy API key).
 *
 * @packageDocumentation
 */

import { AIProjectClient } from '@azure/ai-projects';
import {
  ClientSecretCredential,
  DefaultAzureCredential,
  type TokenCredential,
  type AccessToken,
  type GetTokenOptions,
} from '@azure/identity';
import type OpenAI from 'openai';
import type { ProvidersConfigMap } from './registry.js';
import { getProviderEndpoint } from './registry.js';
import {
  forwardAzureFoundryLegacy,
  type ChatRequestBody,
} from './shared.js';

export const FOUNDRY_DEFAULTS = {
  projectEndpointEnv: 'FOUNDRY_PROJECT_ENDPOINT',
  legacyEndpointEnv: 'AZURE_OPENAI_API_KEY',
  apiVersion: 'v1',
  conversationHeader: 'x-foundry-conversation-id',
  agentNameHeader: 'x-foundry-agent-name',
  agentVersionHeader: 'x-foundry-agent-version',
  featuresHeader: 'x-foundry-features',
  timeoutMs: 120_000,
} as const;

export interface AzureFoundryProviderConfig {
  enabled?: boolean;
  projectEndpoint?: string;
  baseUrl?: string;
  apiVersion?: string;
  apiKeyEnv?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  useDefaultCredential?: boolean;
  timeoutMs?: number;
  foundryFeatures?: string;
  defaultAgent?: string;
}

export interface FoundryForwardContext {
  conversationId?: string;
  agentName?: string;
  agentVersion?: string;
  foundryFeatures?: string;
  bearerToken?: string | null;
}

class BearerTokenCredential implements TokenCredential {
  constructor(private readonly token: string) {}

  async getToken(
    _scopes: string | string[],
    _options?: GetTokenOptions
  ): Promise<AccessToken> {
    return {
      token: this.token,
      expiresOnTimestamp: Date.now() + 3_600_000,
    };
  }
}

const clientCache = new Map<string, AIProjectClient>();

function cacheKey(endpoint: string, credentialKind: string): string {
  return `${endpoint}::${credentialKind}`;
}

export function resolveProjectEndpoint(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap
): string | null {
  const fromConfig = config?.projectEndpoint?.trim();
  if (fromConfig) {
    return fromConfig;
  }
  const fromProviders = (
    providersConfig?.['azure-foundry'] as AzureFoundryProviderConfig | undefined
  )?.projectEndpoint?.trim();
  if (fromProviders) {
    return fromProviders;
  }
  const fromEnv =
    process.env[FOUNDRY_DEFAULTS.projectEndpointEnv]?.trim() ??
    process.env.AZURE_AI_PROJECT_ENDPOINT?.trim();
  return fromEnv || null;
}

export function isFoundrySdkMode(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap
): boolean {
  return !!resolveProjectEndpoint(config, providersConfig);
}

export function resolveFoundryCredential(
  config?: AzureFoundryProviderConfig,
  bearerToken?: string | null
): TokenCredential {
  if (bearerToken && bearerToken !== 'foundry-sdk') {
    return new BearerTokenCredential(bearerToken);
  }

  const tenantId = config?.tenantId ?? process.env.AZURE_TENANT_ID;
  const clientId = config?.clientId ?? process.env.AZURE_CLIENT_ID;
  const clientSecret = config?.clientSecret ?? process.env.AZURE_CLIENT_SECRET;

  if (tenantId && clientId && clientSecret) {
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  return new DefaultAzureCredential();
}

export function createFoundryClient(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
): AIProjectClient {
  const endpoint = resolveProjectEndpoint(config, providersConfig);
  if (!endpoint) {
    throw new Error('Azure Foundry project endpoint not configured');
  }

  const credential = resolveFoundryCredential(config, bearerToken);
  const credKind =
    bearerToken && bearerToken !== 'foundry-sdk'
      ? `bearer:${bearerToken.slice(-8)}`
      : config?.clientId
        ? `sp:${config.clientId}`
        : 'default';

  const key = cacheKey(endpoint, credKind);
  const existing = clientCache.get(key);
  if (existing) {
    return existing;
  }

  const client = new AIProjectClient(endpoint, credential);
  clientCache.set(key, client);
  return client;
}

export function getFoundryOpenAiClient(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
): OpenAI {
  return createFoundryClient(config, providersConfig, bearerToken).getOpenAIClient();
}

function resolveFoundryOptions(
  config?: AzureFoundryProviderConfig,
  ctx?: FoundryForwardContext
): Record<string, unknown> | undefined {
  const features = ctx?.foundryFeatures ?? config?.foundryFeatures;
  return features ? { foundryFeatures: features } : undefined;
}

export async function collectPaged<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

export function mapFoundryError(
  err: unknown,
  context = 'Azure Foundry error'
): { error: string; hint: string; status: number } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('credential')) {
    return {
      error: message,
      hint: 'Authenticate with Entra ID: run `az login`, set service principal env vars (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET), or pass Authorization: Bearer <entra-token>',
      status: 401,
    };
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return {
      error: message,
      hint: 'Verify IAM role assignment on the Foundry project (Azure portal → Access Control)',
      status: 403,
    };
  }
  if (lower.includes('not configured') || lower.includes('project endpoint')) {
    return {
      error: message,
      hint: 'Set FOUNDRY_PROJECT_ENDPOINT or providers.azure-foundry.projectEndpoint in config.json',
      status: 400,
    };
  }

  return {
    error: `${context}: ${message}`,
    hint: 'See https://learn.microsoft.com/javascript/api/overview/azure/ai-projects-readme',
    status: 502,
  };
}

export function mapFoundryUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): Record<string, number> {
  const prompt = usage?.prompt_tokens ?? 0;
  const completion = usage?.completion_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage?.total_tokens ?? prompt + completion,
  };
}

function chatBodyFromRequest(request: ChatRequestBody, targetModel: string): Record<string, unknown> {
  return {
    ...request,
    model: targetModel,
  };
}

export async function forwardToFoundryChat(
  request: ChatRequestBody,
  targetModel: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
): Promise<
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: ReturnType<typeof mapFoundryError> }
> {
  if (!isFoundrySdkMode(config, providersConfig)) {
    const apiKey = bearerToken && bearerToken !== 'foundry-sdk' ? bearerToken : process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: mapFoundryError(new Error('Missing AZURE_OPENAI_API_KEY for legacy Azure Foundry mode')),
      };
    }
    const response = await forwardAzureFoundryLegacy(request, targetModel, apiKey, providersConfig, false);
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return { success: false, error: mapFoundryError(data['error'] ?? data, 'Azure Foundry legacy error') };
    }
    return { success: true, data };
  }

  try {
    const openai = getFoundryOpenAiClient(config, providersConfig, bearerToken);
    const result = await openai.chat.completions.create(
      chatBodyFromRequest(request, targetModel) as never
    );
    return {
      success: true,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return { success: false, error: mapFoundryError(err) };
  }
}

export async function forwardToFoundryChatStream(
  request: ChatRequestBody,
  targetModel: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
): Promise<
  | { success: true; stream: AsyncGenerator<string, void, undefined> }
  | { success: false; error: ReturnType<typeof mapFoundryError> }
> {
  if (!isFoundrySdkMode(config, providersConfig)) {
    const apiKey = bearerToken && bearerToken !== 'foundry-sdk' ? bearerToken : process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: mapFoundryError(new Error('Missing AZURE_OPENAI_API_KEY for legacy Azure Foundry mode')),
      };
    }
    const response = await forwardAzureFoundryLegacy(request, targetModel, apiKey, providersConfig, true);
    if (!response.ok || !response.body) {
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: mapFoundryError(errData) };
    }

    async function* pipeBody(): AsyncGenerator<string, void, undefined> {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield decoder.decode(value, { stream: true });
      }
    }

    return { success: true, stream: pipeBody() };
  }

  try {
    const openai = getFoundryOpenAiClient(config, providersConfig, bearerToken);
    const stream = (await openai.chat.completions.create({
      ...(chatBodyFromRequest(request, targetModel) as Record<string, unknown>),
      stream: true,
    } as never)) as unknown as AsyncIterable<Record<string, unknown>>;

    async function* toSse(): AsyncGenerator<string, void, undefined> {
      for await (const chunk of stream) {
        yield `data: ${JSON.stringify(chunk)}\n\n`;
      }
      yield 'data: [DONE]\n\n';
    }

    return { success: true, stream: toSse() };
  } catch (err) {
    return { success: false, error: mapFoundryError(err) };
  }
}

export async function forwardToFoundryResponses(
  body: Record<string, unknown>,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  ctx?: FoundryForwardContext,
  stream = false
): Promise<
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: ReturnType<typeof mapFoundryError> }
  | { success: true; stream: AsyncGenerator<string, void, undefined> }
> {
  if (!isFoundrySdkMode(config, providersConfig)) {
    return {
      success: false,
      error: mapFoundryError(
        new Error('Foundry Responses API requires projectEndpoint (SDK mode)')
      ),
    };
  }

  try {
    const openai = getFoundryOpenAiClient(config, providersConfig, ctx?.bearerToken);
    const agentName = ctx?.agentName ?? config?.defaultAgent;
    const requestOptions = resolveFoundryOptions(config, ctx);

    const payload: Record<string, unknown> = {
      ...body,
      ...(ctx?.conversationId ? { conversation: ctx.conversationId } : {}),
      stream,
    };

    const extra: Record<string, unknown> = {};
    if (agentName) {
      extra.body = {
        agent: {
          name: agentName,
          ...(ctx?.agentVersion ? { version: ctx.agentVersion } : {}),
          type: 'agent_reference',
        },
      };
    }

    if (stream) {
      const responseStream = (await openai.responses.create(
        payload as never,
        {
          ...(requestOptions ?? {}),
          ...(Object.keys(extra).length > 0 ? extra : {}),
        } as never
      )) as unknown as AsyncIterable<unknown>;

      async function* toSse(): AsyncGenerator<string, void, undefined> {
        for await (const event of responseStream as AsyncIterable<unknown>) {
          yield `data: ${JSON.stringify(event)}\n\n`;
        }
        yield 'data: [DONE]\n\n';
      }

      return { success: true, stream: toSse() };
    }

    const result = await openai.responses.create(
      payload as never,
      {
        ...(requestOptions ?? {}),
        ...(Object.keys(extra).length > 0 ? extra : {}),
      } as never
    );

    return { success: true, data: result as unknown as Record<string, unknown> };
  } catch (err) {
    return { success: false, error: mapFoundryError(err, 'Foundry Responses API error') };
  }
}

/** Legacy fetch wrapper — returns Response for backward compatibility. */
export async function forwardAzureFoundry(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  providersConfig?: ProvidersConfigMap,
  stream = false,
  apiVersion?: string
): Promise<Response> {
  const cfg = providersConfig?.['azure-foundry'] as AzureFoundryProviderConfig | undefined;
  if (isFoundrySdkMode(cfg, providersConfig)) {
    const bearer = apiKey === 'foundry-sdk' ? null : apiKey;
    const result = stream
      ? await forwardToFoundryChatStream(request, targetModel, cfg, providersConfig, bearer)
      : await forwardToFoundryChat(request, targetModel, cfg, providersConfig, bearer);

    if (!result.success) {
      return new Response(JSON.stringify(result.error), {
        status: result.error.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (stream && 'stream' in result && result.stream) {
      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for await (const chunk of result.stream!) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      return new Response(readable, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    return new Response(JSON.stringify((result as { data: Record<string, unknown> }).data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return forwardAzureFoundryLegacy(
    request,
    targetModel,
    apiKey,
    providersConfig,
    stream,
    apiVersion ?? cfg?.apiVersion ?? FOUNDRY_DEFAULTS.apiVersion
  );
}

// --- Metadata helpers ---

export async function foundryPing(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  const deployments = await collectPaged(client.deployments.list());
  return {
    ok: true,
    projectEndpoint: resolveProjectEndpoint(config, providersConfig),
    deploymentCount: deployments.length,
  };
}

export async function foundryListDeployments(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  query?: { modelPublisher?: string }
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  const listOpts = query?.modelPublisher ? { modelPublisher: query.modelPublisher } : undefined;
  return collectPaged(client.deployments.list(listOpts as never));
}

export async function foundryGetDeployment(
  name: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.deployments.get(name);
}

export async function foundryListConnections(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  query?: Record<string, unknown>
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.connections.list(query as never));
}

export async function foundryGetConnection(
  name: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.connections.get(name);
}

export async function foundryGetConnectionWithCredentials(
  name: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.connections.getWithCredentials(name);
}

export async function foundryGetDefaultConnection(
  connectionType: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.connections.getDefault(connectionType as never);
}

export async function foundryListDatasets(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.datasets.list());
}

export async function foundryListDatasetVersions(
  name: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.datasets.listVersions(name));
}

export async function foundryGetDataset(
  name: string,
  version: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.datasets.get(name, version);
}

export async function foundryDeleteDataset(
  name: string,
  version: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  await client.datasets.delete(name, version);
  return { deleted: true, name, version };
}

export async function foundryUploadDatasetFile(
  name: string,
  version: string,
  filePath: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.datasets.uploadFile(name, version, filePath);
}

export async function foundryListIndexes(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.indexes.list());
}

export async function foundryGetIndex(
  name: string,
  version: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.indexes.get(name, version);
}

export async function foundryCreateOrUpdateIndex(
  name: string,
  version: string,
  body: Record<string, unknown>,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.indexes.createOrUpdate(name, version, body as never, resolveFoundryOptions(config, ctx) as never);
}

export async function foundryListAgents(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.agents.list(resolveFoundryOptions(config, ctx) as never));
}

export async function foundryCreateAgentVersion(
  agentName: string,
  definition: Record<string, unknown>,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.agents.createVersion(
    agentName,
    definition as never,
    resolveFoundryOptions(config, ctx) as never
  );
}

export async function foundryGetAgentVersion(
  agentName: string,
  agentVersion: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.agents.getVersion(
    agentName,
    agentVersion,
    resolveFoundryOptions(config, ctx) as never
  );
}

export async function foundryDeleteAgentVersion(
  agentName: string,
  agentVersion: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.agents.deleteVersion(
    agentName,
    agentVersion,
    resolveFoundryOptions(config, ctx) as never
  );
}

export async function foundryCreateConversation(
  items: unknown[],
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
): Promise<unknown> {
  const openai = getFoundryOpenAiClient(config, providersConfig, bearerToken);
  return openai.conversations.create({ items } as never);
}

export async function foundryGetConversation(
  conversationId: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
): Promise<unknown> {
  const openai = getFoundryOpenAiClient(config, providersConfig, bearerToken);
  return openai.conversations.retrieve(conversationId);
}

export async function foundryDeleteConversation(
  conversationId: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null
): Promise<unknown> {
  const openai = getFoundryOpenAiClient(config, providersConfig, bearerToken);
  return openai.conversations.delete(conversationId);
}

export function resolveLegacyApiKey(config?: AzureFoundryProviderConfig): string | null {
  const endpoint = getProviderEndpoint('azure-foundry', undefined);
  const envKey = process.env[config?.apiKeyEnv ?? endpoint.apiKeyEnv];
  return envKey?.trim() ? envKey.trim() : null;
}

export function isFoundrySdkAuthToken(apiKey?: string): boolean {
  return apiKey === 'foundry-sdk' || !apiKey;
}

// --- Beta helpers ---

function betaOpts(config?: AzureFoundryProviderConfig, ctx?: FoundryForwardContext) {
  return resolveFoundryOptions(config, ctx) as never;
}

export async function foundryBetaListAgentSessions(
  agentName: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.beta.agents.listSessions(agentName, betaOpts(config, ctx)));
}

export async function foundryBetaCreateAgentSession(
  agentName: string,
  versionIndicator: Record<string, unknown>,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.beta.agents.createSession(agentName, versionIndicator as never, betaOpts(config, ctx));
}

export async function foundryBetaGetAgentSession(
  agentName: string,
  sessionId: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.beta.agents.getSession(agentName, sessionId, betaOpts(config, ctx));
}

export async function foundryBetaDeleteAgentSession(
  agentName: string,
  sessionId: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.beta.agents.deleteSession(agentName, sessionId, betaOpts(config, ctx));
}

export async function foundryBetaListSkills(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.beta.skills.list(betaOpts(config, ctx)));
}

export async function foundryBetaGetSkill(
  name: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.beta.skills.get(name, betaOpts(config, ctx));
}

export async function foundryBetaListToolboxes(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.beta.toolboxes.list(betaOpts(config, ctx)));
}

export async function foundryBetaGetToolbox(
  name: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.beta.toolboxes.get(name, betaOpts(config, ctx));
}

export async function foundryBetaListMemoryStores(
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return collectPaged(client.beta.memoryStores.list(betaOpts(config, ctx)));
}

export async function foundryBetaGetMemoryStore(
  name: string,
  config?: AzureFoundryProviderConfig,
  providersConfig?: ProvidersConfigMap,
  bearerToken?: string | null,
  ctx?: FoundryForwardContext
) {
  const client = createFoundryClient(config, providersConfig, bearerToken);
  return client.beta.memoryStores.get(name, betaOpts(config, ctx));
}
