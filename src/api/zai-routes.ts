/**
 * Proxy routes for z.ai provider APIs (/v1/providers/zai/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ZAI_DEFAULTS,
  buildZaiPaasUrl,
  buildZaiV1Url,
  getZaiAsyncResult,
  mapZaiError,
  zaiJsonRequest,
  zaiMultipartRequest,
} from '../providers/zai.js';

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveApiKey(req: IncomingMessage): string | null {
  return extractBearerToken(req) ?? process.env[ZAI_DEFAULTS.apiKeyEnv] ?? null;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req);
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw.toString('utf8')) as unknown;
}

function sendMissingKey(res: ServerResponse): void {
  const mapped = mapZaiError(401, { error: { code: '1002', message: 'Missing API key' } });
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

async function pipeJsonUpstream(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamPath: string,
  useV1 = false
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
    const mapped = mapZaiError(400, { error: { code: '1210', message: 'Invalid JSON body' } });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const url = useV1 ? buildZaiV1Url(upstreamPath) : buildZaiPaasUrl(upstreamPath);
  const upstream = await zaiJsonRequest('POST', url, apiKey, body);

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errBody));
    return;
  }

  const data = await upstream.json();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function pipeMultipartUpstream(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamPath: string,
  useV1 = false
): Promise<void> {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }

  const contentType = req.headers['content-type'];
  if (!contentType?.includes('multipart/form-data')) {
    const mapped = mapZaiError(400, { error: { code: '1210', message: 'Expected multipart/form-data' } });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mapped));
    return;
  }

  const body = await readRawBody(req);
  const url = useV1 ? buildZaiV1Url(upstreamPath) : buildZaiPaasUrl(upstreamPath);
  const upstream = await zaiMultipartRequest(url, apiKey, body, contentType);

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errBody));
    return;
  }

  const responseType = upstream.headers.get('content-type') ?? '';
  if (responseType.includes('text/event-stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
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
    return;
  }

  const data = await upstream.json();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleZaiTokenizerRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/tokenizer');
}

export async function handleZaiWebSearchRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/web_search');
}

export async function handleZaiReaderRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/reader');
}

export async function handleZaiLayoutParsingRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/layout_parsing');
}

export async function handleZaiImageGenerationsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/images/generations');
}

export async function handleZaiImageGenerationsAsyncRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/async/images/generations');
}

export async function handleZaiVideoGenerationsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/videos/generations');
}

export async function handleZaiAudioTranscriptionsRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeMultipartUpstream(req, res, '/audio/transcriptions');
}

export async function handleZaiAgentsConversationRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/agents/conversation', true);
}

export async function handleZaiAgentsAsyncResultRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeJsonUpstream(req, res, '/agents/async-result', true);
}

export async function handleZaiAgentsFileUploadRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await pipeMultipartUpstream(req, res, '/files');
}

export async function handleZaiAsyncResultRoute(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string
): Promise<void> {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }

  const upstream = await getZaiAsyncResult(taskId, apiKey);
  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errBody));
    return;
  }

  const data = await upstream.json();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
