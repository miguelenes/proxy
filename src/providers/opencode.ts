/**
 * OpenCode agent server provider — SDK client for local OpenCode server (default :4096).
 *
 * @packageDocumentation
 */

import {
  OPENCODE_SERVER_DEFAULTS,
  mapOpencodeError,
} from './opencode-routing.js';
import type { ProvidersConfigMap } from './registry.js';
import { getProviderEndpoint } from './registry.js';

export { OPENCODE_SERVER_DEFAULTS, mapOpencodeError };

type OpencodeSdkModule = typeof import('@opencode-ai/sdk');
type OpencodeClient = ReturnType<OpencodeSdkModule['createOpencodeClient']>;

let opencodeSdkPromise: Promise<OpencodeSdkModule> | undefined;

async function loadOpencodeSdk(): Promise<OpencodeSdkModule> {
  if (!opencodeSdkPromise) {
    opencodeSdkPromise = import('@opencode-ai/sdk');
  }
  return opencodeSdkPromise;
}

export interface OpencodeServerProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
}

function resolveServerBaseUrl(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
): string {
  if (config?.baseUrl?.trim()) {
    return config.baseUrl.trim().replace(/\/$/, '');
  }
  const fromEnv = process.env[OPENCODE_SERVER_DEFAULTS.baseUrlEnv];
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, '');
  }
  const endpoint = getProviderEndpoint('opencode', providersConfig);
  return (endpoint.baseUrl || OPENCODE_SERVER_DEFAULTS.baseUrl).replace(/\/$/, '');
}

export async function createOpencodeServerClient(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<OpencodeClient> {
  const { createOpencodeClient } = await loadOpencodeSdk();
  return createOpencodeClient({
    baseUrl: resolveServerBaseUrl(config, providersConfig),
  });
}

export async function opencodePing(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
): Promise<unknown> {
  const baseUrl = resolveServerBaseUrl(config, providersConfig);
  const response = await fetch(`${baseUrl}/global/health`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenCode server health check failed (${response.status}): ${text}`);
  }
  return response.json();
}

export async function opencodeGetConfig(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.config.get();
}

export async function opencodeGetProviders(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.config.providers();
}

export async function opencodeListProjects(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.project.list();
}

export async function opencodeCurrentProject(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.project.current();
}

export async function opencodeListSessions(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.session.list();
}

export async function opencodeCreateSession(
  body: Record<string, unknown>,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.session.create({ body: body as never });
}

export async function opencodeGetSession(
  sessionId: string,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.session.get({ path: { id: sessionId } });
}

export async function opencodeDeleteSession(
  sessionId: string,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.session.delete({ path: { id: sessionId } });
}

export async function opencodeSessionPrompt(
  sessionId: string,
  body: Record<string, unknown>,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.session.prompt({ path: { id: sessionId }, body: body as never });
}

export async function opencodeSessionAbort(
  sessionId: string,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.session.abort({ path: { id: sessionId } });
}

export async function opencodeSessionMessages(
  sessionId: string,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.session.messages({ path: { id: sessionId } });
}

export async function opencodeFindText(
  query: Record<string, unknown>,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.find.text({ query: query as never });
}

export async function opencodeFindFiles(
  query: Record<string, unknown>,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.find.files({ query: query as never });
}

export async function opencodeFileRead(
  query: Record<string, unknown>,
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.file.read({ query: query as never });
}

export async function opencodeSubscribeEvents(
  config?: OpencodeServerProviderConfig,
  providersConfig?: ProvidersConfigMap
) {
  const client = await createOpencodeServerClient(config, providersConfig);
  return client.event.subscribe();
}

export function unwrapSdkResult<T>(result: { data?: T; error?: unknown } | T): T {
  if (result && typeof result === 'object' && 'data' in result) {
    const wrapped = result as { data?: T; error?: unknown };
    if (wrapped.error) {
      throw wrapped.error;
    }
    return wrapped.data as T;
  }
  return result as T;
}

export function mapOpencodeServerError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.toLowerCase().includes('econnrefused') || message.includes('fetch failed')) {
    return {
      error: message,
      hint: 'OpenCode server not reachable — start OpenCode locally (default http://127.0.0.1:4096) or set providers.opencode.baseUrl',
      status: 503,
    };
  }
  return mapOpencodeError(err, 'zen');
}
