# OpenRouter provider

Dedicated OpenRouter integration in `src/providers/openrouter.ts` using the official [`@openrouter/sdk`](https://openrouter.ai/docs/client-sdks/typescript/overview) TypeScript SDK.

## Configuration

| Setting | Value |
|---------|-------|
| API key env | `OPENROUTER_API_KEY` |
| Base URL | `https://openrouter.ai/api/v1` |
| Attribution (optional) | `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE`, `OPENROUTER_APP_CATEGORIES` |

Override via `providers.openrouter` in `~/.trestle/config.json`:

```json
{
  "providers": {
    "openrouter": {
      "httpReferer": "https://myapp.example",
      "appTitle": "My Trestle Proxy",
      "timeoutMs": 120000
    }
  }
}
```

## Chat adapter

OpenAI-compatible clients route `openrouter/*` models through the SDK:

```bash
export OPENROUTER_API_KEY=sk-or-...
curl -s http://localhost:4100/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openrouter/anthropic/claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

The module converts SDK camelCase responses back to OpenAI snake_case (`prompt_tokens`, `finish_reason`, etc.) and preserves OpenRouter fields like `usage.cost` and `openrouter_metadata`.

## Proxy routes

Bearer token from request or `OPENROUTER_API_KEY` env fallback:

| Proxy route | Method | SDK |
|-------------|--------|-----|
| `/v1/providers/openrouter/models` | GET | `models.list` |
| `/v1/providers/openrouter/models/count` | GET | `models.count` |
| `/v1/providers/openrouter/models/:author/:slug` | GET | `models.get` |
| `/v1/providers/openrouter/credits` | GET | `credits.getCredits` (management key) |
| `/v1/providers/openrouter/generations/:id` | GET | `generations.getGeneration` |
| `/v1/providers/openrouter/generations/:id/content` | GET | `generations.listGenerationContent` |
| `/v1/providers/openrouter/embeddings` | POST | `embeddings.generate` |
| `/v1/providers/openrouter/embeddings/models` | GET | `embeddings.listModels` |
| `/v1/providers/openrouter/providers` | GET | `providers.list` |

Example — list models:

```bash
curl -s 'http://localhost:4100/v1/providers/openrouter/models?category=programming' \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

Example — generation stats:

```bash
curl -s "http://localhost:4100/v1/providers/openrouter/generations/gen_abc123" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

## Routing features

OpenRouter-only request fields pass through via chat completions (`models[]` fallbacks, `provider` preferences, `plugins`, etc.). See [OpenRouter API reference](https://openrouter.ai/docs/api-reference/overview).

## References

- [TypeScript SDK overview](https://openrouter.ai/docs/client-sdks/typescript/overview)
- [Model routing](https://openrouter.ai/docs/guides/routing/model-fallbacks)
