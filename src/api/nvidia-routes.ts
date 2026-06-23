/**
 * Proxy routes for NVIDIA NIM provider APIs (/v1/providers/nvidia/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  NVIDIA_DEFAULTS,
  mapNvidiaError,
  nvidiaEmbed,
  nvidiaListModels,
  nvidiaRank,
} from '../providers/nvidia.js';

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveApiKey(req: IncomingMessage): string | null {
  return extractBearerToken(req) ?? process.env[NVIDIA_DEFAULTS.apiKeyEnv] ?? null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw.toString('utf8')) as unknown;
}

function sendMissingKey(res: ServerResponse): void {
  const mapped = mapNvidiaError(401, { error: 'Missing API key' });
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { error: 'Invalid JSON from NVIDIA NIM' };
  }
}

async function pipeJsonUpstream(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamFn: (body: unknown, apiKey: string) => Promise<Response>
): Promise<void> {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    const mapped = mapNvidiaError(400, { error: 'Invalid JSON body' });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const upstream = await upstreamFn(body, apiKey);

  if (!upstream.ok) {
    const errBody = await readJsonResponse(upstream);
    const mapped = mapNvidiaError(upstream.status, errBody);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const data = await readJsonResponse(upstream);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function pipeGetUpstream(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamFn: (apiKey: string) => Promise<Response>
): Promise<void> {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }

  const upstream = await upstreamFn(apiKey);

  if (!upstream.ok) {
    const errBody = await readJsonResponse(upstream);
    const mapped = mapNvidiaError(upstream.status, errBody);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const data = await readJsonResponse(upstream);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleNvidiaEmbeddingsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, nvidiaEmbed);
}

export async function handleNvidiaRankingRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, nvidiaRank);
}

export async function handleNvidiaModelsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeGetUpstream(req, res, nvidiaListModels);
}
