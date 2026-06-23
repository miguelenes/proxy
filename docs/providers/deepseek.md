# DeepSeek provider

Dedicated DeepSeek integration in `src/providers/deepseek.ts` (not the generic OpenAI-compatible path).

## Canonical models

| Model | Use case | Thinking |
|-------|----------|----------|
| `deepseek-v4-flash` | Fast, cost-efficient | Disabled by default upstream |
| `deepseek-v4-pro` | Complex reasoning | Thinking / `reasoning_content` |

## Legacy aliases (deprecated 2026-07-24)

| Legacy | Resolves to |
|--------|-------------|
| `deepseek-chat` | `deepseek-v4-flash` |
| `deepseek-reasoner` | `deepseek-v4-pro` |

Short aliases in `MODEL_MAPPING`: `deepseek` → flash, `deepseek-flash`, `deepseek-pro`, `deepseek-r1` → pro.

## Configuration

| Setting | Value |
|---------|-------|
| Env key | `DEEPSEEK_API_KEY` |
| Base URL | `https://api.deepseek.com` (no `/v1` suffix) |
| Beta URL (prefix completion) | `https://api.deepseek.com/beta` |

Override base URL via `providers.deepseek.baseUrl` in `~/.trestle/config.json`.

## Features

### Prefix completion (beta)

When the last message is `{ role: "assistant", prefix: true, ... }`, requests POST to `/beta/chat/completions` instead of `/chat/completions`.

### Thinking mode

For `deepseek-v4-pro` (and legacy `deepseek-reasoner`), the proxy forwards `extra_body.thinking` and `reasoning_effort` unchanged. Streaming surfaces `delta.reasoning_content` on chat completions (passthrough) and as `response.reasoning.delta` on the Responses API translation path.

### KV cache pricing

Telemetry uses cache-aware pricing when DeepSeek returns `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`:

| Model | Cache miss ($/1M) | Cache hit ($/1M) | Output ($/1M) |
|-------|-------------------|------------------|---------------|
| `deepseek-v4-flash` | 0.14 | 0.0028 | 0.28 |
| `deepseek-v4-pro` | 0.435 | 0.003625 | 0.87 |

## Proxy endpoints

| Endpoint | Upstream | Auth |
|----------|----------|------|
| `GET /v1/providers/deepseek/balance` | `GET /user/balance` | `DEEPSEEK_API_KEY` or `Authorization: Bearer` |
| `GET /v1/providers/deepseek/models` | `GET /models` | Same |

## Error mapping

Upstream failures with a parseable body are normalized to `{ error, hint }`:

| Status | Hint |
|--------|------|
| 400 | Invalid request body — check the schema |
| 401 | Authentication failed — verify DEEPSEEK_API_KEY |
| 402 | Insufficient balance — top up at platform.deepseek.com |
| 422 | Invalid parameters |
| 429 | Rate limited — back off and retry |
| 500/503 | Server error — retry after a brief wait |

## Out of scope

- Anthropic-format API at `https://api.deepseek.com/anthropic` (TODO)

## References

- [DeepSeek API docs](https://api-docs.deepseek.com/)
- Module: [`src/providers/deepseek.ts`](../../src/providers/deepseek.ts)
- Routes: [`src/api/deepseek-routes.ts`](../../src/api/deepseek-routes.ts)
