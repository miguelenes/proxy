/**
 * Proxy routes for DeepSeek provider metadata (/v1/providers/deepseek/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DEEPSEEK_DEFAULTS,
  getDeepSeekBalance,
  listDeepSeekModels,
  mapDeepSeekError,
} from '../providers/deepseek.js';

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveApiKey(req: IncomingMessage): string | null {
  return extractBearerToken(req) ?? process.env[DEEPSEEK_DEFAULTS.apiKeyEnv] ?? null;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { error: 'Invalid JSON from DeepSeek' };
  }
}

export async function handleDeepSeekBalanceRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    const mapped = mapDeepSeekError(401, { error: 'Missing API key' });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const upstream = await getDeepSeekBalance(apiKey);
  const body = await readJsonResponse(upstream);

  if (!upstream.ok) {
    const mapped = mapDeepSeekError(upstream.status, body);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleDeepSeekModelsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    const mapped = mapDeepSeekError(401, { error: 'Missing API key' });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const upstream = await listDeepSeekModels(apiKey);
  const body = await readJsonResponse(upstream);

  if (!upstream.ok) {
    const mapped = mapDeepSeekError(upstream.status, body);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
