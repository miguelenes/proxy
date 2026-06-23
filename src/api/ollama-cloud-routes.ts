/**
 * Proxy routes for Ollama Cloud provider APIs (/v1/providers/ollama-cloud/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  OLLAMA_CLOUD_DEFAULTS,
  mapOllamaCloudError,
  ollamaCloudAnthropicMessages,
  ollamaCloudEmbed,
  ollamaCloudGenerate,
  ollamaCloudListModels,
  ollamaCloudListRunning,
  ollamaCloudShowModel,
  ollamaCloudVersion,
} from '../providers/ollama-cloud.js';

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveApiKey(req: IncomingMessage): string | null {
  return extractBearerToken(req) ?? process.env[OLLAMA_CLOUD_DEFAULTS.apiKeyEnv] ?? null;
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
  const mapped = mapOllamaCloudError(401, { error: 'Missing API key' });
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { error: 'Invalid JSON from Ollama Cloud' };
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
    const mapped = mapOllamaCloudError(400, { error: 'Invalid JSON body' });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const upstream = await upstreamFn(body, apiKey);

  if (!upstream.ok) {
    const errBody = await readJsonResponse(upstream);
    const mapped = mapOllamaCloudError(upstream.status, errBody);
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
    const mapped = mapOllamaCloudError(upstream.status, errBody);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const data = await readJsonResponse(upstream);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function pipeNdjsonUpstream(
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
    const mapped = mapOllamaCloudError(400, { error: 'Invalid JSON body' });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const upstream = await upstreamFn(body, apiKey);

  if (!upstream.ok) {
    const errBody = await readJsonResponse(upstream);
    const mapped = mapOllamaCloudError(upstream.status, errBody);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/x-ndjson';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (upstream.body) {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  }
  res.end();
}

export async function handleOllamaCloudGenerateRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeNdjsonUpstream(req, res, ollamaCloudGenerate);
}

export async function handleOllamaCloudEmbedRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, ollamaCloudEmbed);
}

export async function handleOllamaCloudVersionRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeGetUpstream(req, res, ollamaCloudVersion);
}

export async function handleOllamaCloudTagsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeGetUpstream(req, res, ollamaCloudListModels);
}

export async function handleOllamaCloudPsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeGetUpstream(req, res, ollamaCloudListRunning);
}

export async function handleOllamaCloudShowRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, ollamaCloudShowModel);
}

export async function handleOllamaCloudMessagesRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, ollamaCloudAnthropicMessages);
}
