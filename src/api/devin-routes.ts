/**
 * Proxy routes for Devin v3 provider APIs (/v1/providers/devin/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  DEVIN_DEFAULTS,
  mapDevinError,
  devinSelf,
  devinListSessions,
  devinCreateSession,
  devinGetSession,
  devinTerminateSession,
  devinSendSessionMessage,
  devinListSessionMessages,
  devinArchiveSession,
  devinGetSessionTags,
  devinAppendSessionTags,
  devinReplaceSessionTags,
  devinGetPrReview,
  devinTriggerPrReview,
  devinListNotes,
  devinCreateNote,
  devinGetNote,
  devinUpdateNote,
  devinDeleteNote,
  devinKnowledgeFolders,
  devinListPlaybooks,
  devinCreatePlaybook,
  devinGetPlaybook,
  devinUpdatePlaybook,
  devinDeletePlaybook,
  devinListSecrets,
  devinCreateSecret,
  devinDeleteSecret,
  devinListRepositories,
  devinListIndexedRepos,
  devinIndexRepository,
  devinRemoveRepository,
  devinRepoIndexingStatus,
  devinListSchedules,
  devinCreateSchedule,
  devinGetSchedule,
  devinUpdateSchedule,
  devinDeleteSchedule,
  devinMetricsUsageOrg,
  devinMetricsSessions,
  devinMetricsPrs,
  devinMetricsSearches,
  devinMetricsActiveUsers,
  devinMetricsDau,
  devinMetricsWau,
  devinMetricsMau,
  devinConsumptionDaily,
  devinConsumptionDailyUser,
  devinConsumptionDailySession,
  devinConsumptionDailyServiceUser,
  type DevinPaginationOpts,
} from "../providers/devin.js";

export interface DevinRouteOptions {
  orgId?: string;
}

interface DevinRouteContext {
  configOrgId?: string;
}

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  const token = auth.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function resolveDevinApiKey(req: IncomingMessage): string | null {
  return (
    extractBearerToken(req) ?? process.env[DEVIN_DEFAULTS.apiKeyEnv] ?? null
  );
}

function resolveDevinOrgId(
  req: IncomingMessage,
  configOrgId?: string,
): string | null {
  const headerOrg = req.headers["x-devin-org-id"];
  if (typeof headerOrg === "string" && headerOrg.trim().length > 0) {
    return headerOrg.trim();
  }
  const envOrg = process.env[DEVIN_DEFAULTS.orgIdEnv];
  if (envOrg && envOrg.trim().length > 0) {
    return envOrg.trim();
  }
  if (configOrgId && configOrgId.trim().length > 0) {
    return configOrgId.trim();
  }
  return null;
}

function parsePaginationFromUrl(url: string): DevinPaginationOpts {
  const parsed = new URL(url, "http://localhost");
  const firstParam = parsed.searchParams.get("first");
  const after = parsed.searchParams.get("after") ?? undefined;
  const query: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    if (key !== "first" && key !== "after") {
      query[key] = value;
    }
  });
  const opts: DevinPaginationOpts = { query };
  if (firstParam !== null) {
    const first = Number(firstParam);
    if (!Number.isNaN(first)) {
      opts.first = first;
    }
  }
  if (after) {
    opts.after = after;
  }
  return opts;
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
  return JSON.parse(raw.toString("utf8")) as unknown;
}

function sendMissingKey(res: ServerResponse): void {
  const mapped = mapDevinError(401, { error: "Missing API key" });
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify(mapped));
}

function sendMissingOrg(res: ServerResponse): void {
  const mapped = mapDevinError(400, {
    error: "Missing organization ID",
    message: "Set DEVIN_ORG_ID env or X-Devin-Org-Id header",
  });
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify(mapped));
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { error: "Invalid JSON from Devin" };
  }
}

async function pipeUpstream(
  res: ServerResponse,
  upstream: Response,
): Promise<void> {
  if (!upstream.ok) {
    const errBody = await readJsonResponse(upstream);
    const mapped = mapDevinError(upstream.status, errBody);
    res.writeHead(upstream.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(mapped));
    return;
  }

  const data = await readJsonResponse(upstream);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

type OrgHandler = (
  orgId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
) => Promise<Response>;

type OrgBodyHandler = (
  orgId: string,
  apiKey: string,
  body: unknown,
) => Promise<Response>;

type OrgIdHandler = (
  orgId: string,
  resourceId: string,
  apiKey: string,
  opts?: DevinPaginationOpts,
) => Promise<Response>;

type OrgIdBodyHandler = (
  orgId: string,
  resourceId: string,
  apiKey: string,
  body: unknown,
) => Promise<Response>;

async function pipeOrgGet(
  req: IncomingMessage,
  res: ServerResponse,
  fn: OrgHandler,
  ctx: DevinRouteContext,
): Promise<void> {
  const apiKey = resolveDevinApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }
  const orgId = resolveDevinOrgId(req, ctx.configOrgId);
  if (!orgId) {
    sendMissingOrg(res);
    return;
  }
  const opts = parsePaginationFromUrl(req.url ?? "");
  const upstream = await fn(orgId, apiKey, opts);
  await pipeUpstream(res, upstream);
}

async function pipeOrgPost(
  req: IncomingMessage,
  res: ServerResponse,
  fn: OrgBodyHandler,
  ctx: DevinRouteContext,
): Promise<void> {
  const apiKey = resolveDevinApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }
  const orgId = resolveDevinOrgId(req, ctx.configOrgId);
  if (!orgId) {
    sendMissingOrg(res);
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    const mapped = mapDevinError(400, { error: "Invalid JSON body" });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(mapped));
    return;
  }
  const upstream = await fn(orgId, apiKey, body);
  await pipeUpstream(res, upstream);
}

async function pipeOrgPut(
  req: IncomingMessage,
  res: ServerResponse,
  orgId: string,
  resourceId: string,
  fn: OrgIdBodyHandler,
): Promise<void> {
  const apiKey = resolveDevinApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    const mapped = mapDevinError(400, { error: "Invalid JSON body" });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(mapped));
    return;
  }
  const upstream = await fn(orgId, resourceId, apiKey, body);
  await pipeUpstream(res, upstream);
}

async function pipeOrgPatch(
  req: IncomingMessage,
  res: ServerResponse,
  orgId: string,
  resourceId: string,
  fn: OrgIdBodyHandler,
): Promise<void> {
  const apiKey = resolveDevinApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    const mapped = mapDevinError(400, { error: "Invalid JSON body" });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(mapped));
    return;
  }
  const upstream = await fn(orgId, resourceId, apiKey, body);
  await pipeUpstream(res, upstream);
}

async function pipeOrgDeleteBody(
  req: IncomingMessage,
  res: ServerResponse,
  fn: OrgBodyHandler,
  ctx: DevinRouteContext,
): Promise<void> {
  const apiKey = resolveDevinApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }
  const orgId = resolveDevinOrgId(req, ctx.configOrgId);
  if (!orgId) {
    sendMissingOrg(res);
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    const mapped = mapDevinError(400, { error: "Invalid JSON body" });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(mapped));
    return;
  }
  const upstream = await fn(orgId, apiKey, body);
  await pipeUpstream(res, upstream);
}

async function pipeOrgGetById(
  req: IncomingMessage,
  res: ServerResponse,
  resourceId: string,
  fn: OrgIdHandler,
  ctx: DevinRouteContext,
): Promise<void> {
  const apiKey = resolveDevinApiKey(req);
  if (!apiKey) {
    sendMissingKey(res);
    return;
  }
  const orgId = resolveDevinOrgId(req, ctx.configOrgId);
  if (!orgId) {
    sendMissingOrg(res);
    return;
  }
  const opts = parsePaginationFromUrl(req.url ?? "");
  const upstream = await fn(orgId, resourceId, apiKey, opts);
  await pipeUpstream(res, upstream);
}

/**
 * Dispatch /v1/providers/devin/* requests to upstream Devin v3 APIs.
 * Returns true if the route was handled.
 */
export async function handleDevinRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: DevinRouteOptions,
): Promise<boolean> {
  if (!pathname.startsWith("/v1/providers/devin")) {
    return false;
  }

  const ctx: DevinRouteContext = { configOrgId: options?.orgId };
  const sub = pathname.slice("/v1/providers/devin".length) || "/";

  if (method === "GET" && sub === "/self") {
    const apiKey = resolveDevinApiKey(req);
    if (!apiKey) {
      sendMissingKey(res);
      return true;
    }
    await pipeUpstream(res, await devinSelf(apiKey));
    return true;
  }

  if (sub === "/sessions" && method === "GET") {
    await pipeOrgGet(req, res, devinListSessions, ctx);
    return true;
  }
  if (sub === "/sessions" && method === "POST") {
    await pipeOrgPost(req, res, devinCreateSession, ctx);
    return true;
  }

  const sessionMatch = sub.match(/^\/sessions\/([^/]+)(\/.*)?$/);
  if (sessionMatch) {
    const sessionId = sessionMatch[1]!;
    const tail = sessionMatch[2] ?? "";

    if (method === "GET" && tail === "") {
      await pipeOrgGetById(
        req,
        res,
        sessionId,
        (org, id, key) => devinGetSession(org, id, key),
        ctx,
      );
      return true;
    }
    if (method === "DELETE" && tail === "") {
      const apiKey = resolveDevinApiKey(req);
      const orgId = resolveDevinOrgId(req, ctx.configOrgId);
      if (!apiKey) {
        sendMissingKey(res);
        return true;
      }
      if (!orgId) {
        sendMissingOrg(res);
        return true;
      }
      await pipeUpstream(
        res,
        await devinTerminateSession(orgId, sessionId, apiKey),
      );
      return true;
    }
    if (method === "POST" && tail === "/messages") {
      await pipeOrgPost(
        req,
        res,
        (org, key, body) => devinSendSessionMessage(org, sessionId, key, body),
        ctx,
      );
      return true;
    }
    if (method === "GET" && tail === "/messages") {
      await pipeOrgGetById(
        req,
        res,
        sessionId,
        (org, id, key, opts) => devinListSessionMessages(org, id, key, opts),
        ctx,
      );
      return true;
    }
    if (method === "POST" && tail === "/archive") {
      const apiKey = resolveDevinApiKey(req);
      const orgId = resolveDevinOrgId(req, ctx.configOrgId);
      if (!apiKey) {
        sendMissingKey(res);
        return true;
      }
      if (!orgId) {
        sendMissingOrg(res);
        return true;
      }
      await pipeUpstream(
        res,
        await devinArchiveSession(orgId, sessionId, apiKey),
      );
      return true;
    }
    if (method === "GET" && tail === "/tags") {
      await pipeOrgGetById(
        req,
        res,
        sessionId,
        (org, id, key) => devinGetSessionTags(org, id, key),
        ctx,
      );
      return true;
    }
    if (method === "POST" && tail === "/tags") {
      await pipeOrgPost(
        req,
        res,
        (org, key, body) => devinAppendSessionTags(org, sessionId, key, body),
        ctx,
      );
      return true;
    }
    if (method === "PUT" && tail === "/tags") {
      const orgId = resolveDevinOrgId(req, ctx.configOrgId);
      if (!orgId) {
        sendMissingOrg(res);
        return true;
      }
      await pipeOrgPut(req, res, orgId, sessionId, devinReplaceSessionTags);
      return true;
    }
  }

  if (method === "GET" && sub === "/pr-reviews") {
    await pipeOrgGet(req, res, devinGetPrReview, ctx);
    return true;
  }
  if (method === "POST" && sub === "/pr-reviews") {
    await pipeOrgPost(req, res, devinTriggerPrReview, ctx);
    return true;
  }

  if (method === "GET" && sub === "/knowledge/notes") {
    await pipeOrgGet(req, res, devinListNotes, ctx);
    return true;
  }
  if (method === "POST" && sub === "/knowledge/notes") {
    await pipeOrgPost(req, res, devinCreateNote, ctx);
    return true;
  }
  if (method === "GET" && sub === "/knowledge/folders") {
    await pipeOrgGet(
      req,
      res,
      (orgId, apiKey) => devinKnowledgeFolders(orgId, apiKey),
      ctx,
    );
    return true;
  }

  const noteMatch = sub.match(/^\/knowledge\/notes\/([^/]+)$/);
  if (noteMatch) {
    const noteId = noteMatch[1]!;
    const orgId = resolveDevinOrgId(req, ctx.configOrgId);
    const apiKey = resolveDevinApiKey(req);
    if (!apiKey) {
      sendMissingKey(res);
      return true;
    }
    if (!orgId) {
      sendMissingOrg(res);
      return true;
    }
    if (method === "GET") {
      await pipeUpstream(res, await devinGetNote(orgId, noteId, apiKey));
      return true;
    }
    if (method === "PUT") {
      await pipeOrgPut(req, res, orgId, noteId, devinUpdateNote);
      return true;
    }
    if (method === "DELETE") {
      await pipeUpstream(res, await devinDeleteNote(orgId, noteId, apiKey));
      return true;
    }
  }

  if (method === "GET" && sub === "/playbooks") {
    await pipeOrgGet(req, res, devinListPlaybooks, ctx);
    return true;
  }
  if (method === "POST" && sub === "/playbooks") {
    await pipeOrgPost(req, res, devinCreatePlaybook, ctx);
    return true;
  }

  const playbookMatch = sub.match(/^\/playbooks\/([^/]+)$/);
  if (playbookMatch) {
    const playbookId = playbookMatch[1]!;
    const orgId = resolveDevinOrgId(req, ctx.configOrgId);
    const apiKey = resolveDevinApiKey(req);
    if (!apiKey) {
      sendMissingKey(res);
      return true;
    }
    if (!orgId) {
      sendMissingOrg(res);
      return true;
    }
    if (method === "GET") {
      await pipeUpstream(
        res,
        await devinGetPlaybook(orgId, playbookId, apiKey),
      );
      return true;
    }
    if (method === "PUT") {
      await pipeOrgPut(req, res, orgId, playbookId, devinUpdatePlaybook);
      return true;
    }
    if (method === "DELETE") {
      await pipeUpstream(
        res,
        await devinDeletePlaybook(orgId, playbookId, apiKey),
      );
      return true;
    }
  }

  if (method === "GET" && sub === "/secrets") {
    await pipeOrgGet(req, res, devinListSecrets, ctx);
    return true;
  }
  if (method === "POST" && sub === "/secrets") {
    await pipeOrgPost(req, res, devinCreateSecret, ctx);
    return true;
  }

  const secretMatch = sub.match(/^\/secrets\/([^/]+)$/);
  if (secretMatch && method === "DELETE") {
    const secretId = secretMatch[1]!;
    const orgId = resolveDevinOrgId(req, ctx.configOrgId);
    const apiKey = resolveDevinApiKey(req);
    if (!apiKey) {
      sendMissingKey(res);
      return true;
    }
    if (!orgId) {
      sendMissingOrg(res);
      return true;
    }
    await pipeUpstream(res, await devinDeleteSecret(orgId, secretId, apiKey));
    return true;
  }

  if (method === "GET" && sub === "/repositories") {
    await pipeOrgGet(req, res, devinListRepositories, ctx);
    return true;
  }
  if (method === "GET" && sub === "/repositories/indexed") {
    await pipeOrgGet(req, res, devinListIndexedRepos, ctx);
    return true;
  }
  if (method === "PUT" && sub === "/repositories/index") {
    await pipeOrgPost(req, res, devinIndexRepository, ctx);
    return true;
  }
  if (method === "DELETE" && sub === "/repositories/index") {
    await pipeOrgDeleteBody(req, res, devinRemoveRepository, ctx);
    return true;
  }
  if (method === "GET" && sub === "/repositories/status") {
    await pipeOrgGet(req, res, devinRepoIndexingStatus, ctx);
    return true;
  }

  if (method === "GET" && sub === "/schedules") {
    await pipeOrgGet(req, res, devinListSchedules, ctx);
    return true;
  }
  if (method === "POST" && sub === "/schedules") {
    await pipeOrgPost(req, res, devinCreateSchedule, ctx);
    return true;
  }

  const scheduleMatch = sub.match(/^\/schedules\/([^/]+)$/);
  if (scheduleMatch) {
    const scheduleId = scheduleMatch[1]!;
    const orgId = resolveDevinOrgId(req, ctx.configOrgId);
    const apiKey = resolveDevinApiKey(req);
    if (!apiKey) {
      sendMissingKey(res);
      return true;
    }
    if (!orgId) {
      sendMissingOrg(res);
      return true;
    }
    if (method === "GET") {
      await pipeUpstream(
        res,
        await devinGetSchedule(orgId, scheduleId, apiKey),
      );
      return true;
    }
    if (method === "PATCH") {
      await pipeOrgPatch(req, res, orgId, scheduleId, devinUpdateSchedule);
      return true;
    }
    if (method === "DELETE") {
      await pipeUpstream(
        res,
        await devinDeleteSchedule(orgId, scheduleId, apiKey),
      );
      return true;
    }
  }

  const metricsRoutes: Record<string, OrgHandler> = {
    "/metrics/usage": devinMetricsUsageOrg,
    "/metrics/sessions": devinMetricsSessions,
    "/metrics/prs": devinMetricsPrs,
    "/metrics/searches": devinMetricsSearches,
    "/metrics/active-users": devinMetricsActiveUsers,
    "/metrics/dau": devinMetricsDau,
    "/metrics/wau": devinMetricsWau,
    "/metrics/mau": devinMetricsMau,
  };
  if (method === "GET" && metricsRoutes[sub]) {
    await pipeOrgGet(req, res, metricsRoutes[sub]!, ctx);
    return true;
  }

  if (method === "GET" && sub === "/consumption/daily") {
    await pipeOrgGet(req, res, devinConsumptionDaily, ctx);
    return true;
  }

  const consumptionUserMatch = sub.match(
    /^\/consumption\/daily\/users\/([^/]+)$/,
  );
  if (consumptionUserMatch && method === "GET") {
    const userId = consumptionUserMatch[1]!;
    await pipeOrgGetById(
      req,
      res,
      userId,
      (org, id, key, opts) => devinConsumptionDailyUser(org, id, key, opts),
      ctx,
    );
    return true;
  }

  const consumptionSessionMatch = sub.match(
    /^\/consumption\/daily\/sessions\/([^/]+)$/,
  );
  if (consumptionSessionMatch && method === "GET") {
    const sessionId = consumptionSessionMatch[1]!;
    await pipeOrgGetById(
      req,
      res,
      sessionId,
      (org, id, key, opts) => devinConsumptionDailySession(org, id, key, opts),
      ctx,
    );
    return true;
  }

  const consumptionSuMatch = sub.match(
    /^\/consumption\/daily\/service-users\/([^/]+)$/,
  );
  if (consumptionSuMatch && method === "GET") {
    const suId = consumptionSuMatch[1]!;
    await pipeOrgGetById(
      req,
      res,
      suId,
      (org, id, key, opts) =>
        devinConsumptionDailyServiceUser(org, id, key, opts),
      ctx,
    );
    return true;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Devin route not found", path: sub }));
  return true;
}
