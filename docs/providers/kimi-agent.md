# Kimi Agent SDK

Local agent sessions via `@moonshot-ai/kimi-agent-sdk` and the `kimi` CLI.

Provider id: `kimi-agent` · model prefix: `kimi-agent/{model}`

## Prerequisites

1. Install the **kimi** CLI (Kimi Code) and ensure it is on `PATH`
2. `pnpm` peer: `zod` (installed with this fork)
3. Optional: `MOONSHOT_API_KEY` forwarded into CLI env for cloud-backed models

```bash
kimi login   # or export MOONSHOT_API_KEY
```

## Config

```json
{
  "providers": {
    "kimi-agent": {
      "workDir": "/home/user/myproject",
      "thinking": true,
      "yoloMode": false,
      "approveAllTools": true,
      "maxWaitMs": 120000
    }
  }
}
```

| Field | Purpose |
|-------|---------|
| `workDir` | Project root for CLI sessions (default: `process.cwd()`) |
| `thinking` | Enable thinking mode |
| `yoloMode` | Auto-approve tool calls |
| `approveAllTools` | Sets `yoloMode: true` when `yoloMode` unset |
| `executable` | CLI binary name (default `kimi`) |

## Sticky sessions

| Header | Purpose |
|--------|---------|
| `X-Kimi-Session-Id` | Resume an existing SDK session |
| `X-Kimi-Work-Dir` | Route to a specific workspace |

## Chat via proxy

```json
{
  "model": "kimi-agent/kimi-latest",
  "messages": [{ "role": "user", "content": "Summarize this repo" }]
}
```

Response includes `X-Kimi-Session-Id` for follow-up turns.

## Agent routes

| Route | Description |
|-------|-------------|
| `GET /v1/providers/kimi-agent/ping` | CLI + config probe |
| `GET /v1/providers/kimi-agent/config` | Parsed kimi config |
| `GET /v1/providers/kimi-agent/sessions` | List sessions |
| `POST /v1/providers/kimi-agent/sessions` | Create session |
| `GET /v1/providers/kimi-agent/sessions/:id/events` | Replay events |
| `DELETE /v1/providers/kimi-agent/sessions/:id` | Delete session |
| `POST /v1/providers/kimi-agent/sessions/:id/prompt` | Send prompt (`stream`, `wait`) |
| `POST /v1/providers/kimi-agent/sessions/:id/interrupt` | Interrupt active turn |
| `POST /v1/providers/kimi-agent/sessions/:id/approve` | Approve tool request |
| `POST /v1/providers/kimi-agent/mcp/:name/auth` | MCP auth |
| `POST /v1/providers/kimi-agent/mcp/:name/reset-auth` | Reset MCP auth |
| `POST /v1/providers/kimi-agent/mcp/:name/test` | Test MCP server |

No API key required on agent routes; the CLI manages its own auth.

## Tool approvals

Without `yoloMode` / `approveAllTools`, streaming may pause on `ApprovalRequest`. Use:

- `yoloMode: true` in config for automation, or
- `POST .../sessions/:id/approve` with `{ "requestId", "response" }`

## See also

- [Kimi cloud provider](./kimi.md)
- [Kimi client integration](../integrations/kimi.md)
