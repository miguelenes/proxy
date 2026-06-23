/**
 * Proxy routes for Azure AI Foundry (/v1/providers/azure-foundry/*).
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import {
  FOUNDRY_DEFAULTS,
  isFoundrySdkMode,
  mapFoundryError,
  foundryPing,
  foundryListDeployments,
  foundryGetDeployment,
  foundryListConnections,
  foundryGetConnection,
  foundryGetConnectionWithCredentials,
  foundryGetDefaultConnection,
  foundryListDatasets,
  foundryListDatasetVersions,
  foundryGetDataset,
  foundryDeleteDataset,
  foundryUploadDatasetFile,
  foundryListIndexes,
  foundryGetIndex,
  foundryCreateOrUpdateIndex,
  foundryListAgents,
  foundryCreateAgentVersion,
  foundryGetAgentVersion,
  foundryDeleteAgentVersion,
  foundryCreateConversation,
  foundryGetConversation,
  foundryDeleteConversation,
  forwardToFoundryResponses,
  foundryBetaListAgentSessions,
  foundryBetaCreateAgentSession,
  foundryBetaGetAgentSession,
  foundryBetaDeleteAgentSession,
  foundryBetaListSkills,
  foundryBetaGetSkill,
  foundryBetaListToolboxes,
  foundryBetaGetToolbox,
  foundryBetaListMemoryStores,
  foundryBetaGetMemoryStore,
  type AzureFoundryProviderConfig,
  type FoundryForwardContext,
} from '../providers/azure-foundry.js';

export interface AzureFoundryRouteOptions {
  config?: AzureFoundryProviderConfig;
}

function extractBearer(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function forwardContext(req: IncomingMessage, config?: AzureFoundryProviderConfig): FoundryForwardContext {
  const header = (name: string) => req.headers[name] as string | undefined;
  return {
    bearerToken: extractBearer(req),
    conversationId: header(FOUNDRY_DEFAULTS.conversationHeader),
    agentName: header(FOUNDRY_DEFAULTS.agentNameHeader),
    agentVersion: header(FOUNDRY_DEFAULTS.agentVersionHeader),
    foundryFeatures: header(FOUNDRY_DEFAULTS.featuresHeader) ?? config?.foundryFeatures,
  };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
}

function sendError(res: ServerResponse, err: unknown): void {
  const mapped = mapFoundryError(err);
  res.writeHead(mapped.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: mapped.error, hint: mapped.hint }));
}

function requireSdkMode(config: AzureFoundryProviderConfig | undefined, res: ServerResponse): boolean {
  if (!isFoundrySdkMode(config)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Azure Foundry SDK routes require projectEndpoint',
        hint: 'Set FOUNDRY_PROJECT_ENDPOINT or providers.azure-foundry.projectEndpoint. Legacy API-key mode only supports chat/completions.',
      })
    );
    return false;
  }
  return true;
}

function queryFromUrl(req: IncomingMessage): Record<string, string | undefined> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

export async function handleAzureFoundryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  options?: AzureFoundryRouteOptions
): Promise<boolean> {
  if (!pathname.startsWith('/v1/providers/azure-foundry')) {
    return false;
  }

  const sub = pathname.slice('/v1/providers/azure-foundry'.length) || '/';
  const config = options?.config;
  const ctx = forwardContext(req, config);

  if (!requireSdkMode(config, res)) {
    return true;
  }

  try {
    if (method === 'GET' && sub === '/ping') {
      const result = await foundryPing(config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    if (method === 'GET' && sub === '/deployments') {
      const query = queryFromUrl(req);
      const deployments = await foundryListDeployments(config, undefined, ctx.bearerToken, {
        modelPublisher: query['modelPublisher'],
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(deployments));
      return true;
    }

    const deploymentMatch = sub.match(/^\/deployments\/([^/]+)$/);
    if (deploymentMatch && method === 'GET') {
      const name = decodeURIComponent(deploymentMatch[1]!);
      const deployment = await foundryGetDeployment(name, config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(deployment));
      return true;
    }

    if (method === 'GET' && sub === '/connections') {
      const connections = await foundryListConnections(config, undefined, ctx.bearerToken, queryFromUrl(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(connections));
      return true;
    }

    const connCredsMatch = sub.match(/^\/connections\/([^/]+)\/credentials$/);
    if (connCredsMatch && method === 'GET') {
      const name = decodeURIComponent(connCredsMatch[1]!);
      const connection = await foundryGetConnectionWithCredentials(name, config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(connection));
      return true;
    }

    const connDefaultMatch = sub.match(/^\/connections\/default\/([^/]+)$/);
    if (connDefaultMatch && method === 'GET') {
      const type = decodeURIComponent(connDefaultMatch[1]!);
      const connection = await foundryGetDefaultConnection(type, config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(connection));
      return true;
    }

    const connMatch = sub.match(/^\/connections\/([^/]+)$/);
    if (connMatch && method === 'GET') {
      const name = decodeURIComponent(connMatch[1]!);
      const connection = await foundryGetConnection(name, config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(connection));
      return true;
    }

    if (method === 'GET' && sub === '/datasets') {
      const datasets = await foundryListDatasets(config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(datasets));
      return true;
    }

    const datasetVersionsMatch = sub.match(/^\/datasets\/([^/]+)\/versions$/);
    if (datasetVersionsMatch && method === 'GET') {
      const name = decodeURIComponent(datasetVersionsMatch[1]!);
      const versions = await foundryListDatasetVersions(name, config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(versions));
      return true;
    }

    const datasetVersionMatch = sub.match(/^\/datasets\/([^/]+)\/versions\/([^/]+)$/);
    if (datasetVersionMatch) {
      const name = decodeURIComponent(datasetVersionMatch[1]!);
      const version = decodeURIComponent(datasetVersionMatch[2]!);
      if (method === 'GET') {
        const dataset = await foundryGetDataset(name, version, config, undefined, ctx.bearerToken);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dataset));
        return true;
      }
      if (method === 'DELETE') {
        const result = await foundryDeleteDataset(name, version, config, undefined, ctx.bearerToken);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
    }

    const datasetUploadMatch = sub.match(/^\/datasets\/([^/]+)\/versions\/([^/]+)\/upload$/);
    if (datasetUploadMatch && method === 'POST') {
      const name = decodeURIComponent(datasetUploadMatch[1]!);
      const version = decodeURIComponent(datasetUploadMatch[2]!);
      const body = await readJsonBody(req);
      const filePath = body['filePath'] as string | undefined;
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing filePath in JSON body' }));
        return true;
      }
      const dataset = await foundryUploadDatasetFile(
        name,
        version,
        filePath,
        config,
        undefined,
        ctx.bearerToken
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dataset));
      return true;
    }

    if (method === 'GET' && sub === '/indexes') {
      const indexes = await foundryListIndexes(config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(indexes));
      return true;
    }

    const indexMatch = sub.match(/^\/indexes\/([^/]+)\/versions\/([^/]+)$/);
    if (indexMatch) {
      const name = decodeURIComponent(indexMatch[1]!);
      const version = decodeURIComponent(indexMatch[2]!);
      if (method === 'GET') {
        const index = await foundryGetIndex(name, version, config, undefined, ctx.bearerToken);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(index));
        return true;
      }
      if (method === 'PUT' || method === 'POST') {
        const body = await readJsonBody(req);
        const index = await foundryCreateOrUpdateIndex(
          name,
          version,
          body,
          config,
          undefined,
          ctx.bearerToken,
          ctx
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(index));
        return true;
      }
    }

    if (method === 'GET' && sub === '/agents') {
      const agents = await foundryListAgents(config, undefined, ctx.bearerToken, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agents));
      return true;
    }

    if (method === 'POST' && sub === '/agents') {
      const body = await readJsonBody(req);
      const agentName = (body['agentName'] as string | undefined) ?? (body['name'] as string | undefined);
      const definition = (body['definition'] as Record<string, unknown> | undefined) ?? body;
      if (!agentName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing agentName' }));
        return true;
      }
      const agent = await foundryCreateAgentVersion(
        agentName,
        definition,
        config,
        undefined,
        ctx.bearerToken,
        ctx
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agent));
      return true;
    }

    const agentVersionMatch = sub.match(/^\/agents\/([^/]+)\/versions\/([^/]+)$/);
    if (agentVersionMatch) {
      const agentName = decodeURIComponent(agentVersionMatch[1]!);
      const agentVersion = decodeURIComponent(agentVersionMatch[2]!);
      if (method === 'GET') {
        const agent = await foundryGetAgentVersion(
          agentName,
          agentVersion,
          config,
          undefined,
          ctx.bearerToken,
          ctx
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(agent));
        return true;
      }
      if (method === 'DELETE') {
        const result = await foundryDeleteAgentVersion(
          agentName,
          agentVersion,
          config,
          undefined,
          ctx.bearerToken,
          ctx
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
    }

    if (method === 'POST' && sub === '/conversations') {
      const body = await readJsonBody(req);
      const items = (body['items'] as unknown[]) ?? [];
      const conversation = await foundryCreateConversation(items, config, undefined, ctx.bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(conversation));
      return true;
    }

    const conversationMatch = sub.match(/^\/conversations\/([^/]+)$/);
    if (conversationMatch) {
      const id = decodeURIComponent(conversationMatch[1]!);
      if (method === 'GET') {
        const conversation = await foundryGetConversation(id, config, undefined, ctx.bearerToken);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(conversation));
        return true;
      }
      if (method === 'DELETE') {
        const result = await foundryDeleteConversation(id, config, undefined, ctx.bearerToken);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
    }

    if (method === 'POST' && sub === '/responses') {
      const body = await readJsonBody(req);
      const stream = body['stream'] === true;
      const result = await forwardToFoundryResponses(body, config, undefined, ctx, stream);
      if (!result.success) {
        sendError(res, result.error);
        return true;
      }
      if (stream && 'stream' in result && result.stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        for await (const chunk of result.stream) {
          res.write(chunk);
        }
        res.end();
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify((result as { data: Record<string, unknown> }).data));
      return true;
    }

    // Beta: agent sessions
    const betaSessionsMatch = sub.match(/^\/beta\/agents\/([^/]+)\/sessions$/);
    if (betaSessionsMatch) {
      const agentName = decodeURIComponent(betaSessionsMatch[1]!);
      if (method === 'GET') {
        const sessions = await foundryBetaListAgentSessions(
          agentName,
          config,
          undefined,
          ctx.bearerToken,
          ctx
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessions));
        return true;
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const session = await foundryBetaCreateAgentSession(
          agentName,
          body,
          config,
          undefined,
          ctx.bearerToken,
          ctx
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session));
        return true;
      }
    }

    const betaSessionMatch = sub.match(/^\/beta\/agents\/([^/]+)\/sessions\/([^/]+)$/);
    if (betaSessionMatch) {
      const agentName = decodeURIComponent(betaSessionMatch[1]!);
      const sessionId = decodeURIComponent(betaSessionMatch[2]!);
      if (method === 'GET') {
        const session = await foundryBetaGetAgentSession(
          agentName,
          sessionId,
          config,
          undefined,
          ctx.bearerToken,
          ctx
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session));
        return true;
      }
      if (method === 'DELETE') {
        const result = await foundryBetaDeleteAgentSession(
          agentName,
          sessionId,
          config,
          undefined,
          ctx.bearerToken,
          ctx
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
    }

    if (method === 'GET' && sub === '/beta/skills') {
      const skills = await foundryBetaListSkills(config, undefined, ctx.bearerToken, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(skills));
      return true;
    }

    const betaSkillMatch = sub.match(/^\/beta\/skills\/([^/]+)$/);
    if (betaSkillMatch && method === 'GET') {
      const name = decodeURIComponent(betaSkillMatch[1]!);
      const skill = await foundryBetaGetSkill(name, config, undefined, ctx.bearerToken, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(skill));
      return true;
    }

    if (method === 'GET' && sub === '/beta/toolboxes') {
      const toolboxes = await foundryBetaListToolboxes(config, undefined, ctx.bearerToken, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(toolboxes));
      return true;
    }

    const betaToolboxMatch = sub.match(/^\/beta\/toolboxes\/([^/]+)$/);
    if (betaToolboxMatch && method === 'GET') {
      const name = decodeURIComponent(betaToolboxMatch[1]!);
      const toolbox = await foundryBetaGetToolbox(name, config, undefined, ctx.bearerToken, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(toolbox));
      return true;
    }

    if (method === 'GET' && sub === '/beta/memory-stores') {
      const stores = await foundryBetaListMemoryStores(config, undefined, ctx.bearerToken, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stores));
      return true;
    }

    const betaMemoryMatch = sub.match(/^\/beta\/memory-stores\/([^/]+)$/);
    if (betaMemoryMatch && method === 'GET') {
      const name = decodeURIComponent(betaMemoryMatch[1]!);
      const store = await foundryBetaGetMemoryStore(name, config, undefined, ctx.bearerToken, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(store));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: sub }));
    return true;
  } catch (err) {
    sendError(res, err);
    return true;
  }
}
