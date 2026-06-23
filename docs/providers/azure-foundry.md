# Azure AI Foundry

Microsoft Foundry integration via [@azure/ai-projects](https://learn.microsoft.com/javascript/api/overview/azure/ai-projects-readme) with dual auth: **Entra ID SDK** when a project endpoint is configured, or **legacy API-key** fetch when not.

## SDK mode (recommended)

```bash
export FOUNDRY_PROJECT_ENDPOINT="https://{account}.services.ai.azure.com/api/projects/{project}"
az login   # or service principal env vars below
```

Optional service principal:

```bash
export AZURE_TENANT_ID=...
export AZURE_CLIENT_ID=...
export AZURE_CLIENT_SECRET=...
```

Config (`~/.trestle/config.json`):

```json
{
  "providers": {
    "azure-foundry": {
      "projectEndpoint": "https://my-account.services.ai.azure.com/api/projects/my-project",
      "foundryFeatures": "WorkflowAgents=V1Preview"
    }
  }
}
```

## Legacy API-key mode

When `projectEndpoint` is **not** set:

```bash
export AZURE_OPENAI_API_KEY=your_key
```

```json
{
  "providers": {
    "azure-foundry": {
      "baseUrl": "https://{resource}.openai.azure.com/openai/v1"
    }
  }
}
```

## Chat models

```json
{ "model": "azure-foundry/gpt-4o", "messages": [...] }
```

`model` is the **deployment name** in SDK mode.

### Sticky headers (SDK)

| Header | Purpose |
|--------|---------|
| `X-Foundry-Conversation-Id` | Multi-turn Responses / agent conversations |
| `X-Foundry-Agent-Name` | Agent reference for Responses API |
| `X-Foundry-Agent-Version` | Agent version |
| `X-Foundry-Features` | Preview opt-in (overrides config) |

Pass `Authorization: Bearer <entra-access-token>` to use a client token instead of host `az login`.

## Routes (`/v1/providers/azure-foundry/*`)

SDK mode only (except chat completions which also work in legacy mode).

| Route | Description |
|-------|-------------|
| `GET /ping` | Project connectivity + deployment count |
| `GET /deployments` | List model deployments (`?modelPublisher=`) |
| `GET /deployments/:name` | Get deployment |
| `GET /connections` | List project connections |
| `GET /connections/:name` | Get connection |
| `GET /connections/:name/credentials` | Get connection with credentials |
| `GET /connections/default/:type` | Default connection by type |
| `GET /datasets` | List datasets |
| `GET /datasets/:name/versions` | List dataset versions |
| `GET /datasets/:name/versions/:version` | Get dataset version |
| `POST /datasets/:name/versions/:version/upload` | Upload file (`{ "filePath": "/host/path" }`) |
| `DELETE /datasets/:name/versions/:version` | Delete dataset version |
| `GET /indexes` | List search indexes |
| `GET/PUT /indexes/:name/versions/:version` | Get / create-or-update index |
| `GET /agents` | List agents |
| `POST /agents` | Create agent version (`agentName` + `definition`) |
| `GET/DELETE /agents/:name/versions/:version` | Get / delete agent version |
| `POST/GET/DELETE /conversations/:id` | OpenAI Conversations via Foundry |
| `POST /responses` | Native Foundry Responses API (streaming supported) |
| `GET/POST /beta/agents/:name/sessions` | Beta hosted agent sessions |
| `GET/DELETE /beta/agents/:name/sessions/:id` | Beta session get / delete |
| `GET /beta/skills`, `GET /beta/skills/:name` | Beta skills |
| `GET /beta/toolboxes`, `GET /beta/toolboxes/:name` | Beta toolboxes |
| `GET /beta/memory-stores`, `GET /beta/memory-stores/:name` | Beta memory stores |

Docs: [Azure AI Projects JS SDK](https://learn.microsoft.com/javascript/api/overview/azure/ai-projects-readme)
