/**
 * Devin AI v3 provider — chat-completion adapter (session create + poll) and
 * full organization-scoped REST client for sessions, PR reviews, knowledge,
 * playbooks, secrets, repositories, schedules, metrics, and consumption.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';

export interface DevinProviderConfig {
  baseUrl?: string;
  orgId?: string;
  apiKeyEnv?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
  maxPollMs?: number;
  createAsUserId?: string;
}

export const DEVIN_DEFAULTS = {
  baseUrl: 'https://api.devin.ai/v3',
  apiKeyEnv: 'DEVIN_API_KEY',
  orgIdEnv: 'DEVIN_ORG_ID',
  pollIntervalMs: 2000,
  maxPollMs: 120_000,
  enabled: false,
} as const;

export interface DevinPaginatedResponse<T> {
  items: T[];
  has_next_page: boolean;
  end_cursor: string | null;
  total?: number;
}

export interface DevinPaginationOpts {
  first?: number;
  after?: string;
  query?: Record<string, string | number | boolean | undefined>;
}

interface DevinSessionResponse {
  session_id?: string;
  url?: string;
  status?: string;
  result?: string;
  output?: string;
  message?: string;
  structured_output?: unknown;
}

export function devinAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
}

function resolveBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? DEVIN_DEFAULTS.baseUrl).replace(/\/$/, '');
}

export function buildDevinUrl(path: string, baseUrl?: string): string {
  const base = resolveBaseUrl(baseUrl);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function buildDevinOrgUrl(orgId: string, path: string, baseUrl?: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return buildDevinUrl(`/organizations/${orgId}${normalized}`, baseUrl);
}

export function buildPaginationQuery(opts: DevinPaginationOpts = {}): string {
  const params = new URLSearchParams();
  if (opts.first !== undefined) {
    params.set('first', String(opts.first));
  }
  if (opts.after) {
    params.set('after', opts.after);
  }
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function parseErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

export function mapDevinError(
  status: number,
  body: unknown
): { error: string; hint: string } {
  const message =
    typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : typeof body === 'string'
          ? body
          : `Devin API error (${status})`;

  const hints: Record<number, string> = {
    400: 'Invalid request — check parameters and JSON shape',
    401: 'Authentication failed — verify DEVIN_API_KEY (must be cog_-prefixed for v3)',
    403: 'Service user lacks required permission — check role at Settings > Service Users',
    404: 'Resource not found or out of scope',
    422: 'Validation error — check request body shape',
    429: 'Rate limited — back off and retry',
    500: 'Server error — retry after a brief wait',
    503: 'Server error — retry after a brief wait',
  };

  return {
    error: message,
    hint: hints[status] ?? 'Unexpected Devin API error',
  };
}

async function wrapDevinError(response: Response): Promise<Response> {
  const body = await parseErrorBody(response);
  const mapped = mapDevinError(response.status, body);
  const hasParseableShape =
    body !== null &&
    (typeof body === 'object' || (typeof body === 'string' && body.length > 0));

  if (!hasParseableShape) {
    return response;
  }

  return new Response(JSON.stringify(mapped), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function devinJsonRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  apiKey: string,
  body?: unknown
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      ...devinAuthHeaders(apiKey),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const response = await fetch(url, init);
  if (!response.ok) {
    return wrapDevinError(response);
  }
  return response;
}

function orgGet(
  orgId: string,
  path: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  const url = `${buildDevinOrgUrl(orgId, path, baseUrl)}${buildPaginationQuery(opts ?? {})}`;
  return devinJsonRequest('GET', url, apiKey);
}

function orgPost(
  orgId: string,
  path: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return devinJsonRequest('POST', buildDevinOrgUrl(orgId, path, baseUrl), apiKey, body);
}

function orgPut(
  orgId: string,
  path: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return devinJsonRequest('PUT', buildDevinOrgUrl(orgId, path, baseUrl), apiKey, body);
}

function orgPatch(
  orgId: string,
  path: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return devinJsonRequest('PATCH', buildDevinOrgUrl(orgId, path, baseUrl), apiKey, body);
}

function orgDelete(
  orgId: string,
  path: string,
  apiKey: string,
  body?: unknown,
  baseUrl?: string
): Promise<Response> {
  return devinJsonRequest('DELETE', buildDevinOrgUrl(orgId, path, baseUrl), apiKey, body);
}

// --- Self ---

export async function devinSelf(apiKey: string, baseUrl?: string): Promise<Response> {
  return devinJsonRequest('GET', buildDevinUrl('/self', baseUrl), apiKey);
}

// --- Sessions ---

export async function devinListSessions(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/sessions', apiKey, opts, baseUrl);
}

export async function devinCreateSession(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, '/sessions', apiKey, body, baseUrl);
}

export async function devinGetSession(
  orgId: string,
  sessionId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/sessions/${sessionId}`, apiKey, undefined, baseUrl);
}

export async function devinTerminateSession(
  orgId: string,
  sessionId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgDelete(orgId, `/sessions/${sessionId}`, apiKey, undefined, baseUrl);
}

export async function devinSendSessionMessage(
  orgId: string,
  sessionId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, `/sessions/${sessionId}/messages`, apiKey, body, baseUrl);
}

export async function devinListSessionMessages(
  orgId: string,
  sessionId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/sessions/${sessionId}/messages`, apiKey, opts, baseUrl);
}

export async function devinArchiveSession(
  orgId: string,
  sessionId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, `/sessions/${sessionId}/archive`, apiKey, {}, baseUrl);
}

export async function devinGetSessionTags(
  orgId: string,
  sessionId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/sessions/${sessionId}/tags`, apiKey, undefined, baseUrl);
}

export async function devinAppendSessionTags(
  orgId: string,
  sessionId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, `/sessions/${sessionId}/tags`, apiKey, body, baseUrl);
}

export async function devinReplaceSessionTags(
  orgId: string,
  sessionId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPut(orgId, `/sessions/${sessionId}/tags`, apiKey, body, baseUrl);
}

// --- PR Reviews ---

export async function devinGetPrReview(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/pr-reviews', apiKey, opts, baseUrl);
}

export async function devinTriggerPrReview(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, '/pr-reviews', apiKey, body, baseUrl);
}

// --- Knowledge notes ---

export async function devinListNotes(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/knowledge/notes', apiKey, opts, baseUrl);
}

export async function devinCreateNote(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, '/knowledge/notes', apiKey, body, baseUrl);
}

export async function devinGetNote(
  orgId: string,
  noteId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/knowledge/notes/${noteId}`, apiKey, undefined, baseUrl);
}

export async function devinUpdateNote(
  orgId: string,
  noteId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPut(orgId, `/knowledge/notes/${noteId}`, apiKey, body, baseUrl);
}

export async function devinDeleteNote(
  orgId: string,
  noteId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgDelete(orgId, `/knowledge/notes/${noteId}`, apiKey, undefined, baseUrl);
}

export async function devinKnowledgeFolders(
  orgId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/knowledge/folders', apiKey, undefined, baseUrl);
}

// --- Playbooks ---

export async function devinListPlaybooks(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/playbooks', apiKey, opts, baseUrl);
}

export async function devinCreatePlaybook(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, '/playbooks', apiKey, body, baseUrl);
}

export async function devinGetPlaybook(
  orgId: string,
  playbookId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/playbooks/${playbookId}`, apiKey, undefined, baseUrl);
}

export async function devinUpdatePlaybook(
  orgId: string,
  playbookId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPut(orgId, `/playbooks/${playbookId}`, apiKey, body, baseUrl);
}

export async function devinDeletePlaybook(
  orgId: string,
  playbookId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgDelete(orgId, `/playbooks/${playbookId}`, apiKey, undefined, baseUrl);
}

// --- Secrets ---

export async function devinListSecrets(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/secrets', apiKey, opts, baseUrl);
}

export async function devinCreateSecret(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, '/secrets', apiKey, body, baseUrl);
}

export async function devinDeleteSecret(
  orgId: string,
  secretId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgDelete(orgId, `/secrets/${secretId}`, apiKey, undefined, baseUrl);
}

// --- Repositories ---

export async function devinListRepositories(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/repositories', apiKey, opts, baseUrl);
}

export async function devinListIndexedRepos(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/indexed-repositories', apiKey, opts, baseUrl);
}

export async function devinIndexRepository(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPut(orgId, '/bulk-index-repositories', apiKey, body, baseUrl);
}

export async function devinRemoveRepository(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgDelete(orgId, '/bulk-remove-repositories', apiKey, body, baseUrl);
}

export async function devinRepoIndexingStatus(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/repository-indexing-status', apiKey, opts, baseUrl);
}

// --- Schedules ---

export async function devinListSchedules(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/schedules', apiKey, opts, baseUrl);
}

export async function devinCreateSchedule(
  orgId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPost(orgId, '/schedules', apiKey, body, baseUrl);
}

export async function devinGetSchedule(
  orgId: string,
  scheduleId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/schedules/${scheduleId}`, apiKey, undefined, baseUrl);
}

export async function devinUpdateSchedule(
  orgId: string,
  scheduleId: string,
  apiKey: string,
  body: unknown,
  baseUrl?: string
): Promise<Response> {
  return orgPatch(orgId, `/schedules/${scheduleId}`, apiKey, body, baseUrl);
}

export async function devinDeleteSchedule(
  orgId: string,
  scheduleId: string,
  apiKey: string,
  baseUrl?: string
): Promise<Response> {
  return orgDelete(orgId, `/schedules/${scheduleId}`, apiKey, undefined, baseUrl);
}

// --- Metrics ---

export async function devinMetricsUsageOrg(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/usage', apiKey, opts, baseUrl);
}

export async function devinMetricsSessions(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/sessions', apiKey, opts, baseUrl);
}

export async function devinMetricsPrs(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/prs', apiKey, opts, baseUrl);
}

export async function devinMetricsSearches(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/searches', apiKey, opts, baseUrl);
}

export async function devinMetricsActiveUsers(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/active-users', apiKey, opts, baseUrl);
}

export async function devinMetricsDau(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/dau', apiKey, opts, baseUrl);
}

export async function devinMetricsWau(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/wau', apiKey, opts, baseUrl);
}

export async function devinMetricsMau(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/metrics/mau', apiKey, opts, baseUrl);
}

// --- Consumption ---

export async function devinConsumptionDaily(
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, '/consumption/daily', apiKey, opts, baseUrl);
}

export async function devinConsumptionDailyUser(
  orgId: string,
  userId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/consumption/daily/users/${userId}`, apiKey, opts, baseUrl);
}

export async function devinConsumptionDailySession(
  orgId: string,
  sessionId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(orgId, `/consumption/daily/sessions/${sessionId}`, apiKey, opts, baseUrl);
}

export async function devinConsumptionDailyServiceUser(
  orgId: string,
  serviceUserId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
  baseUrl?: string
): Promise<Response> {
  return orgGet(
    orgId,
    `/consumption/daily/service-users/${serviceUserId}`,
    apiKey,
    opts,
    baseUrl
  );
}

// --- Chat adapter ---

function extractUserPrompt(
  messages: Array<{ role?: string; content?: unknown }>
): string {
  const userMessages = messages.filter((m) => m.role === 'user');
  const last = userMessages[userMessages.length - 1] ?? messages[messages.length - 1];
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content
      .map((c: unknown) => {
        const part = c as { type?: string; text?: string };
        return part.text ?? '';
      })
      .join('\n');
  }
  return JSON.stringify(last.content);
}

function toChatCompletion(text: string, model: string): Record<string, unknown> {
  return {
    id: `chatcmpl-devin-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Forward a chat request to Devin via session create + poll.
 */
export async function forwardToDevin(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  config?: DevinProviderConfig
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: { message: string; status: number } }> {
  const apiKey = process.env[config?.apiKeyEnv ?? DEVIN_DEFAULTS.apiKeyEnv];
  const orgId = config?.orgId ?? process.env[DEVIN_DEFAULTS.orgIdEnv];
  const baseUrl = resolveBaseUrl(config?.baseUrl);

  if (!apiKey) {
    return {
      success: false,
      error: {
        message: 'Missing DEVIN_API_KEY environment variable',
        status: 500,
      },
    };
  }
  if (!orgId) {
    return {
      success: false,
      error: {
        message: 'Missing DEVIN_ORG_ID — set env or providers.devin.orgId in config',
        status: 400,
      },
    };
  }

  const prompt = extractUserPrompt(messages);
  const pollInterval = config?.pollIntervalMs ?? DEVIN_DEFAULTS.pollIntervalMs;
  const maxPoll = config?.maxPollMs ?? DEVIN_DEFAULTS.maxPollMs;

  const createBody: Record<string, unknown> = { prompt };
  if (config?.createAsUserId) {
    createBody.create_as_user_id = config.createAsUserId;
  }

  try {
    const createRes = await fetch(buildDevinOrgUrl(orgId, '/sessions', baseUrl), {
      method: 'POST',
      headers: {
        ...devinAuthHeaders(apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      return {
        success: false,
        error: {
          message: `Devin session create failed: ${createRes.status} ${errBody}`,
          status: createRes.status,
        },
      };
    }

    const session = (await createRes.json()) as DevinSessionResponse;
    const sessionId = session.session_id;
    if (!sessionId) {
      const inline =
        session.result ??
        session.output ??
        session.message ??
        (session.structured_output !== undefined
          ? JSON.stringify(session.structured_output)
          : JSON.stringify(session));
      return { success: true, data: toChatCompletion(String(inline), model) };
    }

    const deadline = Date.now() + maxPoll;
    while (Date.now() < deadline) {
      await sleep(pollInterval);
      const pollRes = await fetch(buildDevinOrgUrl(orgId, `/sessions/${sessionId}`, baseUrl), {
        headers: devinAuthHeaders(apiKey),
      });
      if (!pollRes.ok) continue;
      const pollData = (await pollRes.json()) as DevinSessionResponse;
      const status = (pollData.status ?? '').toLowerCase();
      if (status === 'completed' || status === 'done' || status === 'finished') {
        const text =
          pollData.result ??
          pollData.output ??
          pollData.message ??
          (pollData.structured_output !== undefined
            ? JSON.stringify(pollData.structured_output)
            : 'Session completed.');
        return { success: true, data: toChatCompletion(String(text), model) };
      }
      if (status === 'failed' || status === 'error') {
        return {
          success: false,
          error: { message: pollData.message ?? 'Devin session failed', status: 502 },
        };
      }
    }

    return {
      success: false,
      error: {
        message: `Devin session ${sessionId} timed out after ${maxPoll}ms`,
        status: 504,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        message: err instanceof Error ? err.message : String(err),
        status: 502,
      },
    };
  }
}
