/**
 * Proxy routes for OpenRouter provider APIs (/v1/providers/openrouter/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  OPENROUTER_DEFAULTS,
  mapOpenRouterError,
  resolveOpenRouterToken,
  openRouterListModels,
  openRouterModelsCount,
  openRouterGetModel,
  openRouterGetCredits,
  openRouterGetGeneration,
  openRouterListGenerationContent,
  openRouterCreateEmbeddings,
  openRouterListEmbeddingModels,
  openRouterListProviders,
  parseOpenRouterModelSlug,
  type OpenRouterProviderConfig,
} from '../providers/openrouter.js';

export interface OpenRouterRouteOptions {
  config?: OpenRouterProviderConfig;
}

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveRouteToken(
  req: IncomingMessage,
  config?: OpenRouterProviderConfig
): string | null {
  return extractBearerToken(req) ?? resolveOpenRouterToken(config);
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
  const mapped = mapOpenRouterError(new Error('Missing API key'));
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

function sendMappedError(res: ServerResponse, err: unknown): void {
  const mapped = mapOpenRouterError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mapped));
}

function queryFromUrl(req: IncomingMessage): Record<string, string | undefined> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

/**
 * Dispatch /v1/providers/openrouter/* to OpenRouter SDK operations.
 */
export async function handleOpenRouterRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: OpenRouterRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/openrouter')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/openrouter'.length) || '/';
  const config = options?.config;
  const token = resolveRouteToken(req, config);
  if (!token) {
    sendMissingKey(res);
    return true;
  }

  try {
    if (method === 'GET' && sub === '/models/count') {
      const result = await openRouterModelsCount(token, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/models') {
      const result = await openRouterListModels(token, queryFromUrl(req), config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    const modelMatch = sub.match(/^\/models\/(.+)$/);
    if (modelMatch && method === 'GET') {
      const parsed = parseOpenRouterModelSlug(modelMatch[1]!);
      if (!parsed) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid model path — use author/slug' }));
        return true;
      }
      const result = await openRouterGetModel(token, parsed.author, parsed.slug, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/credits') {
      const result = await openRouterGetCredits(token, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    const generationContentMatch = sub.match(/^\/generations\/([^/]+)\/content$/);
    if (generationContentMatch && method === 'GET') {
      const id = generationContentMatch[1]!;
      const result = await openRouterListGenerationContent(token, id, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    const generationMatch = sub.match(/^\/generations\/([^/]+)$/);
    if (generationMatch && method === 'GET') {
      const id = generationMatch[1]!;
      const result = await openRouterGetGeneration(token, id, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'POST' && sub === '/embeddings') {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const result = await openRouterCreateEmbeddings(token, body, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/embeddings/models') {
      const result = await openRouterListEmbeddingModels(token, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/providers') {
      const result = await openRouterListProviders(token, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OpenRouter route not found', path: sub }));
    return true;
  } catch (err) {
    sendMappedError(res, err);
    return true;
  }
}
