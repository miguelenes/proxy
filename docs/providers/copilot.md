# GitHub Copilot SDK provider

Dedicated Copilot integration in `src/providers/copilot.ts` using [`@github/copilot-sdk`](https://docs.github.com/en/copilot/how-tos/copilot-sdk). The SDK spawns the bundled Copilot CLI and speaks JSON-RPC over stdio — there is no public REST chat API.

## Requirements

- **Node.js** `>=20.19.0` (or `>=22.12.0`) — required by the bundled CLI
- Active **GitHub Copilot** subscription
- Supported host OS (local dev / CI; see Docker note below)

## Authentication

| Source | Env / header |
|--------|----------------|
| Primary | `COPILOT_GITHUB_TOKEN` |
| Fallback | `GITHUB_TOKEN` |
| Per-request | `Authorization: Bearer <github_token>` |
| Config | `providers.copilot.gitHubToken` in `~/.trestle/config.json` |

No separate Copilot API key — auth is your GitHub token with Copilot access.

## Configuration

```json
{
  "providers": {
    "copilot": {
      "model": "auto",
      "maxWaitMs": 120000,
      "approveAllTools": true,
      "workingDirectory": "/path/to/repo",
      "reasoningEffort": "medium"
    }
  }
}
```

| Option | Default | Notes |
|--------|---------|-------|
| `approveAllTools` | `true` | Headless proxy auto-approves tool permissions via SDK `approveAll` |
| `useLoggedInUser` | `false` | Set `true` only when running interactively with `gh auth` |
| `maxWaitMs` | `120000` | `sendAndWait` timeout for chat adapter |
| `provider` | — | Optional BYOK passthrough to SDK `ProviderConfig` |

Registry `baseUrl` (`https://api.githubcopilot.com`) is unused for the SDK path.

## Sticky sessions

Pass `X-Copilot-Session-Id` on requests to continue an agent session. The proxy echoes the session id in the response header on success.

Rotate session ids when you need isolation between unrelated tasks.

## Chat completion adapter

OpenAI-compatible clients can use the `copilot` provider:

```bash
export COPILOT_GITHUB_TOKEN=ghp_...
curl -s http://localhost:4100/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "copilot/auto",
    "messages": [{"role": "user", "content": "Explain this repo"}]
  }'
```

Follow-up turn (reuse session):

```bash
curl -s http://localhost:4100/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H "X-Copilot-Session-Id: <id-from-prior-response>" \
  -d '{
    "model": "copilot/auto",
    "messages": [{"role": "user", "content": "Now add tests"}]
  }'
```

Streaming: set `"stream": true` on `/v1/chat/completions`.

## SDK proxy routes

Direct session control via `/v1/providers/copilot/*` (Bearer token or env fallback):

| Proxy route | Method | SDK operation |
|-------------|--------|---------------|
| `/v1/providers/copilot/ping` | GET | `client.ping()` |
| `/v1/providers/copilot/sessions` | GET | `listSessions` |
| `/v1/providers/copilot/sessions` | POST | `createSession` |
| `/v1/providers/copilot/sessions/:id/resume` | POST | `resumeSession` |
| `/v1/providers/copilot/sessions/:id` | DELETE | `deleteSession` |
| `/v1/providers/copilot/sessions/:id/events` | GET | `getEvents` |
| `/v1/providers/copilot/sessions/:id/messages` | POST | `send` / `sendAndWait` / SSE (`stream: true`) |
| `/v1/providers/copilot/sessions/:id/abort` | POST | `abort` |

Example — create session and send a message:

```bash
SESSION=$(curl -s -X POST http://localhost:4100/v1/providers/copilot/sessions \
  -H 'Content-Type: application/json' \
  -d '{"model":"auto"}' | jq -r .sessionId)

curl -s -X POST "http://localhost:4100/v1/providers/copilot/sessions/$SESSION/messages" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"List open issues","wait":true}'
```

## Architecture notes

- **Cold start**: first request spawns the CLI (seconds). A per-token singleton client amortizes this.
- **Shared process**: one CLI per GitHub token in-process — not suitable for untrusted multi-tenant hosting without isolation.
- **Docker**: bundled CLI may need extra OS dependencies; Copilot is primarily for local/CI with GitHub auth. See [.ai/guidelines/docker.md](../../.ai/guidelines/docker.md).

## Advanced: route Copilot LLM calls back through Trestle

SDK `provider` config can point at the proxy (BYOK passthrough):

```json
{
  "providers": {
    "copilot": {
      "provider": {
        "type": "openai",
        "baseUrl": "http://localhost:4100/v1"
      }
    }
  }
}
```

## References

- [Copilot SDK getting started](https://docs.github.com/en/copilot/how-tos/copilot-sdk/getting-started)
- [Client integration guide](docs/integrations/copilot.md)
