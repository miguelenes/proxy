# Qwen Agent SDK

Local Qwen Code sessions via `@qwen-code/sdk` and provider id `qwen-agent`.

The SDK bundles the Qwen Code CLI (~16MB tarball; ~50MB unpacked with ripgrep). No separate `qwen` binary install is required.

## Auth

Cloud chat through the agent uses OpenAI-compatible env passthrough:

```bash
export DASHSCOPE_API_KEY=sk-...
export OPENAI_API_KEY=$DASHSCOPE_API_KEY
# optional compatible-mode override
export OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

Or configure `authType: "qwen-oauth"` in Qwen Code CLI config (`~/.qwen`).

## Config

```json
{
  "providers": {
    "qwen-agent": {
      "cwd": "/home/user/myproject",
      "model": "qwen-plus",
      "permissionMode": "yolo",
      "authType": "openai"
    }
  }
}
```

| Field | Purpose |
|-------|---------|
| `cwd` / `workDir` | Working directory for tool use |
| `permissionMode` | `default`, `plan`, `auto-edit`, or `yolo` |
| `approveAllTools` | Sets `yolo` when `permissionMode` unset |
| `maxWaitMs` | Wall-clock timeout around query iteration (default 120s) |
| `pathToQwenExecutable` | Override bundled CLI path |

## Models

```
qwen-agent/qwen-plus
qwen-agent/qwen-max
```

## Multi-turn sessions

Pass sticky headers on chat requests:

- `X-Qwen-Session-Id` — resume a session
- `X-Qwen-Work-Dir` — workspace override

The proxy returns `X-Qwen-Session-Id` on responses for the next turn.

**Note:** The SDK has no `listSessions` API. Store session IDs from response headers or route responses.

## Proxy routes

| Route | SDK |
|-------|-----|
| `GET /v1/providers/qwen-agent/ping` | SDK / cwd health |
| `POST /v1/providers/qwen-agent/query` | one-shot `query()` (`stream` body flag) |
| `POST /v1/providers/qwen-agent/sessions` | start session (`sessionId` in options) |
| `POST /v1/providers/qwen-agent/sessions/:id/prompt` | `query({ resume })` |
| `POST /v1/providers/qwen-agent/sessions/:id/interrupt` | `Query.interrupt()` |
| `POST /v1/providers/qwen-agent/sessions/:id/permission-mode` | `setPermissionMode()` |
| `POST /v1/providers/qwen-agent/sessions/:id/model` | `setModel()` |
| `GET /v1/providers/qwen-agent/sessions/:id/context-usage` | `getContextUsage()` |
| `GET /v1/providers/qwen-agent/sessions/:id/mcp-status` | `mcpServerStatus()` |
| `GET /v1/providers/qwen-agent/sessions/:id/commands` | `supportedCommands()` |
| `DELETE /v1/providers/qwen-agent/sessions/:id` | `close()` |

## Tool approvals

Without `yolo` / `allowedTools`, streaming may stall waiting for tool approval. Use `permissionMode: "yolo"` for unattended agent runs.

## References

- [@qwen-code/sdk on npm](https://www.npmjs.com/package/@qwen-code/sdk)
