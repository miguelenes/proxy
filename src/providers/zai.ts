/**
 * z.ai (GLM) provider — dedicated chat forwarding with thinking/multimodal support,
 * cache-aware usage mapping, async result fetch, and error normalization.
 *
 * @packageDocumentation
 */

import type { ProvidersConfigMap } from "./registry.js";
import { getProviderEndpoint } from "./registry.js";
import type { ChatRequestBody } from "./shared.js";

export const ZAI_DEFAULTS = {
  baseUrl: "https://api.z.ai/api",
  paasPath: "/paas/v4",
  apiKeyEnv: "ZAI_API_KEY",
} as const;

export const ZAI_MODELS = {
  text: [
    "glm-5.2",
    "glm-5.1",
    "glm-5-turbo",
    "glm-5",
    "glm-4.7",
    "glm-4.7-flash",
    "glm-4.7-flashx",
    "glm-4.6",
    "glm-4.5",
    "glm-4.5-air",
    "glm-4.5-x",
    "glm-4.5-airx",
    "glm-4.5-flash",
    "glm-4-32b-0414-128k",
  ],
  vision: [
    "glm-5v-turbo",
    "glm-4.6v",
    "glm-4.6v-flash",
    "glm-4.6v-flashx",
    "glm-4.5v",
    "autoglm-phone-multilingual",
  ],
  ocr: ["glm-ocr"],
  image: ["glm-image", "cogview-4-250304"],
  video: ["cogvideox-3", "vidu-q1", "vidu-q2"],
  audio: ["glm-asr-2512"],
} as const;

export function isZaiThinkingCapable(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("flash") || m.includes("-air") || m.includes("airx")) {
    return false;
  }
  return /glm-5|glm-4\.7|glm-4\.6/.test(m);
}

export function isZaiVisionModel(model: string): boolean {
  const m = model.toLowerCase();
  return /glm-.*v|autoglm-/.test(m);
}

export interface ZaiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

export interface NormalizedZaiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  prompt_cache_miss_tokens: number;
}

export function mapZaiUsage(u: ZaiUsage): NormalizedZaiUsage {
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  const miss = Math.max(0, u.prompt_tokens - cached);
  return {
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    total_tokens: u.total_tokens ?? u.prompt_tokens + u.completion_tokens,
    cached_tokens: cached,
    prompt_cache_miss_tokens: miss,
  };
}

export interface ZaiForwardOptions {
  providersConfig?: ProvidersConfigMap;
}

function resolvePaasBaseUrl(providersConfig?: ProvidersConfigMap): string {
  const endpoint = getProviderEndpoint("zai", providersConfig);
  const fallback = `${ZAI_DEFAULTS.baseUrl}${ZAI_DEFAULTS.paasPath}`;
  return (endpoint.baseUrl || fallback).replace(/\/$/, "");
}

export function buildZaiPaasUrl(
  subpath: string,
  providersConfig?: ProvidersConfigMap,
): string {
  const base = resolvePaasBaseUrl(providersConfig);
  const path = subpath.startsWith("/") ? subpath : `/${subpath}`;
  if (base.endsWith("/paas/v4") && path.startsWith("/paas/v4")) {
    return `${ZAI_DEFAULTS.baseUrl}${path}`;
  }
  return `${base}${path}`;
}

export function buildZaiV1Url(subpath: string): string {
  const path = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return `${ZAI_DEFAULTS.baseUrl}/v1${path}`;
}

function buildZaiChatUrl(providersConfig?: ProvidersConfigMap): string {
  return buildZaiPaasUrl("/chat/completions", providersConfig);
}

function buildZaiChatBody(
  request: ChatRequestBody,
  targetModel: string,
  stream: boolean,
): Record<string, unknown> {
  return {
    ...request,
    model: targetModel,
    stream,
  };
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

function extractBizCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const err = (body as { error?: unknown }).error;
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  if ("code" in body) {
    return String((body as { code: unknown }).code);
  }
  return undefined;
}

function extractErrorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "object" && err !== null && "message" in err) {
      return String((err as { message: unknown }).message);
    }
    if (typeof err === "string") {
      return err;
    }
  }
  if (typeof body === "object" && body !== null && "message" in body) {
    return String((body as { message: unknown }).message);
  }
  if (typeof body === "string" && body.length > 0) {
    return body;
  }
  return `z.ai API error (${status})`;
}

export function mapZaiError(
  status: number,
  body: unknown,
): { error: string; hint: string } {
  const bizCode = extractBizCode(body);
  const message = extractErrorMessage(body, status);

  const bizHints: Record<string, string> = {
    "1001": "Authentication failed — verify ZAI_API_KEY",
    "1002": "Authentication failed — verify ZAI_API_KEY",
    "1003": "Authentication failed — verify ZAI_API_KEY (token expired)",
    "1004": "Authentication failed — verify ZAI_API_KEY",
    "1112": "Account locked — contact z.ai support",
    "1113": "Account in arrears — top up at z.ai",
    "1210": "Invalid parameters — check the request schema",
    "1213": "Invalid parameters — missing required field",
    "1214": "Invalid parameters — check field values",
    "1215": "Invalid parameters — conflicting fields",
    "1301": "Content policy block — revise prompt and retry",
    "1302": "Rate limited — reduce concurrency and retry",
    "1303": "Rate limited — reduce request frequency",
    "1304": "Daily quota exhausted — contact z.ai or wait for reset",
    "1305": "Rate limited — back off and retry",
    "1308": "Usage limit reached — wait for quota reset",
    "1309": "GLM Coding Plan expired — renew at https://z.ai/subscribe",
    "1310": "Weekly/monthly limit exhausted — wait for reset",
    "1311": "Current plan does not include this model",
    "1312": "Model experiencing high traffic — retry or use another model",
    "1313": "Fair Use Policy restriction — request lift in Personal Center",
  };

  const httpHints: Record<number, string> = {
    400: "Invalid request body — check the schema",
    401: "Authentication failed — verify ZAI_API_KEY",
    429: "Rate limited or quota exhausted — back off and retry",
    500: "Server error — retry after a brief wait",
  };

  if (bizCode && bizHints[bizCode]) {
    return { error: message, hint: bizHints[bizCode] };
  }
  if (status === 401 || (bizCode && /^100[0-4]$/.test(bizCode))) {
    return { error: message, hint: bizHints["1002"] ?? httpHints[401]! };
  }
  if (status === 429 || (bizCode && /^13/.test(bizCode))) {
    return {
      error: message,
      hint: bizHints[bizCode ?? "1305"] ?? httpHints[429]!,
    };
  }
  if (status === 1300 || status === 1301 || bizCode === "1301") {
    return { error: message, hint: bizHints["1301"]! };
  }

  return {
    error: message,
    hint: httpHints[status] ?? "Unexpected z.ai API error",
  };
}

async function wrapZaiError(response: Response): Promise<Response> {
  const body = await parseErrorBody(response);
  const mapped = mapZaiError(response.status, body);
  const hasParseableShape =
    body !== null &&
    (typeof body === "object" || (typeof body === "string" && body.length > 0));

  if (!hasParseableShape) {
    return response;
  }

  return new Response(JSON.stringify(mapped), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function zaiAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Accept-Language": "en-US,en",
  };
}

export async function forwardToZaiChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: ZaiForwardOptions = {},
): Promise<Response> {
  const url = buildZaiChatUrl(opts.providersConfig);
  const body = buildZaiChatBody(request, targetModel, false);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...zaiAuthHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapZaiError(response);
  }

  return response;
}

export async function forwardToZaiChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  opts: ZaiForwardOptions = {},
): Promise<Response> {
  const url = buildZaiChatUrl(opts.providersConfig);
  const body = buildZaiChatBody(request, targetModel, true);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...zaiAuthHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return wrapZaiError(response);
  }

  return response;
}

export async function getZaiAsyncResult(
  id: string,
  apiKey: string,
  providersConfig?: ProvidersConfigMap,
): Promise<Response> {
  const url = buildZaiPaasUrl(
    `/async-result/${encodeURIComponent(id)}`,
    providersConfig,
  );
  return fetch(url, {
    method: "GET",
    headers: zaiAuthHeaders(apiKey),
  });
}

export async function zaiJsonRequest(
  method: "GET" | "POST",
  url: string,
  apiKey: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = zaiAuthHeaders(apiKey);
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  if (!response.ok) {
    return wrapZaiError(response);
  }
  return response;
}

export async function zaiMultipartRequest(
  url: string,
  apiKey: string,
  body: Buffer,
  contentType: string,
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
      "Accept-Language": "en-US,en",
    },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    return wrapZaiError(response);
  }
  return response;
}

// TODO: Anthropic-format forwarding via z.ai /anthropic base URL — out of scope.
// See https://docs.z.ai/api-reference/introduction
