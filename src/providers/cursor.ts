/**
 * Cursor team API client — Admin, Analytics, and AI Code Tracking REST APIs.
 * Not a chat-completion provider; use /v1/providers/cursor/* proxy routes.
 *
 * @packageDocumentation
 */

export interface CursorProviderConfig {
  baseUrl?: string;
  apiKeyEnv?: string;
}

export const CURSOR_DEFAULTS = {
  baseUrl: 'https://api.cursor.com',
  apiKeyEnv: 'CURSOR_API_KEY',
} as const;

export const CURSOR_ALLOWED_PREFIXES = ['/teams/', '/settings/', '/analytics/'] as const;

export interface CursorRequestOpts {
  query?: string;
  body?: unknown;
  ifNoneMatch?: string;
  baseUrl?: string;
}

function resolveBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? CURSOR_DEFAULTS.baseUrl).replace(/\/$/, '');
}

export function cursorBasicAuthHeaders(apiKey: string): Record<string, string> {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    Accept: 'application/json',
  };
}

export function buildCursorUrl(path: string, baseUrl?: string): string {
  const base = resolveBaseUrl(baseUrl);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function isAllowedCursorPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return CURSOR_ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function mapCursorError(
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
          : `Cursor API error (${status})`;

  const hints: Record<number, string> = {
    400: 'Invalid request — check parameters and JSON shape',
    401: 'Authentication failed — verify CURSOR_API_KEY (crsr_ admin-scoped key)',
    403: 'Enterprise access required or insufficient API key permissions',
    404: 'Resource not found',
    429: 'Rate limited — back off and retry (Admin ~20/min, Analytics ~100/min team-level)',
    500: 'Server error — retry after a brief wait',
    503: 'Server error — retry after a brief wait',
  };

  return {
    error: message,
    hint: hints[status] ?? 'Unexpected Cursor API error',
  };
}

export async function cursorRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  apiKey: string,
  opts?: CursorRequestOpts
): Promise<Response> {
  const url = `${buildCursorUrl(path, opts?.baseUrl)}${opts?.query ?? ''}`;
  const headers: Record<string, string> = {
    ...cursorBasicAuthHeaders(apiKey),
  };
  if (opts?.ifNoneMatch) {
    headers['If-None-Match'] = opts.ifNoneMatch;
  }
  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (path.endsWith('.csv')) {
    headers['Accept'] = 'text/csv';
  }

  return fetch(url, {
    method,
    headers,
    ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

// --- Named wrappers (library consumers) ---

export function cursorTeamMembers(apiKey: string, baseUrl?: string): Promise<Response> {
  return cursorRequest('GET', '/teams/members', apiKey, { baseUrl });
}

export function cursorAnalyticsDau(
  apiKey: string,
  query?: string,
  ifNoneMatch?: string,
  baseUrl?: string
): Promise<Response> {
  return cursorRequest('GET', '/analytics/team/dau', apiKey, { query, ifNoneMatch, baseUrl });
}

export function cursorAiCodeCommits(
  apiKey: string,
  query?: string,
  ifNoneMatch?: string,
  baseUrl?: string
): Promise<Response> {
  return cursorRequest('GET', '/analytics/ai-code/commits', apiKey, {
    query,
    ifNoneMatch,
    baseUrl,
  });
}

export function cursorAiCodeChanges(
  apiKey: string,
  query?: string,
  ifNoneMatch?: string,
  baseUrl?: string
): Promise<Response> {
  return cursorRequest('GET', '/analytics/ai-code/changes', apiKey, {
    query,
    ifNoneMatch,
    baseUrl,
  });
}
