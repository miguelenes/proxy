# Kimi Integration

Point Kimi Code or any OpenAI-compatible client at Trestle on port **4100**.

## Cloud (Moonshot API)

```bash
export OPENAI_BASE_URL=http://localhost:4100/v1
export OPENAI_API_KEY=$MOONSHOT_API_KEY
```

Use models like `kimi/kimi-k2.6`. See [providers/kimi.md](../providers/kimi.md).

## Local agent (Kimi CLI)

```bash
export OPENAI_BASE_URL=http://localhost:4100/v1
# API key not required for kimi-agent; CLI uses kimi login
```

Use models like `kimi-agent/kimi-latest`. Requires `kimi` on PATH. See [providers/kimi-agent.md](../providers/kimi-agent.md).

## Dual mode

Both providers can be enabled simultaneously — pick the model prefix per request:

| Prefix | Backend |
|--------|---------|
| `kimi/` | Moonshot REST API |
| `kimi-agent/` | Local kimi CLI via Agent SDK |

## Health checks

```bash
curl http://localhost:4100/v1/providers/kimi/ping -H "Authorization: Bearer $MOONSHOT_API_KEY"
curl http://localhost:4100/v1/providers/kimi-agent/ping
```
