# Devin → Trestle Proxy

Devin uses a session API, not chat-completions. The proxy includes a chat adapter plus full v3 REST routes at `/v1/providers/devin/*`. See [docs/providers/devin.md](../providers/devin.md).

## Environment

```bash
export DEVIN_API_KEY="..."
export DEVIN_ORG_ID="org-..."
```

## Config

```json
{
  "providers": {
    "devin": {
      "enabled": true,
      "orgId": "org-abc123",
      "baseUrl": "https://api.devin.ai/v3"
    }
  }
}
```

## Usage

Send chat-completions with a model resolved to `devin` provider, e.g.:

```json
{ "model": "devin/session", "messages": [{ "role": "user", "content": "Fix the bug in auth.ts" }] }
```

Or use slash form: `devin/session`.

**Limitations:** Async session create + poll (up to 120s default). Not suitable for interactive chat latency.
