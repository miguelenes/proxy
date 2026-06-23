# Ollama Cloud provider

Dedicated Ollama Cloud integration in `src/providers/ollama-cloud.ts` with OpenAI-compat chat forwarding, native `/api/*` clients, and Anthropic-compat messages.

## Configuration

| Setting | Value |
|---------|-------|
| Env key | `OLLAMA_API_KEY` |
| OpenAI-compat base | `https://ollama.com/v1` |
| Native API base | `https://ollama.com/api` |
| Auth | `Authorization: Bearer ${OLLAMA_API_KEY}` |

Override OpenAI-compat base URL via `providers.ollama-cloud.baseUrl` in `~/.trestle/config.json` (default resolves to `https://ollama.com/v1`). Native endpoints always use `https://ollama.com/api`.

## Model catalog

### Chat

`gpt-oss:20b`, `gpt-oss:120b`, `deepseek-v3.1:671b`, `qwen3-coder:480b`, `kimi-k2:1t`, `glm-4.6:cloud`, `qwen3-vl:235b`, `minimax-m2:230b`

### Embeddings

`embeddinggemma`, `nomic-embed-text`, `mxbai-embed-large`

## Short aliases

| Alias | Resolves to |
|-------|-------------|
| `ollama-cloud`, `ollama-cloud-pro` | `gpt-oss:120b` |
| `ollama-cloud-flash` | `gpt-oss:20b` |
| `ollama-cloud-deepseek` | `deepseek-v3.1:671b` |
| `ollama-cloud-qwen` | `qwen3-coder:480b` |
| `ollama-cloud-kimi` | `kimi-k2:1t` |
| `ollama-cloud-glm` | `glm-4.6:cloud` |
| `ollama-cloud-embed` | `embeddinggemma` |

Prefix detection also routes `ollama-cloud/<model>` and models with `-cloud` / `:cloud` suffixes (e.g. `gpt-oss:120b-cloud`).

Models without a cloud suffix (e.g. `gpt-oss:120b`) require an explicit `ollama-cloud/` prefix or short alias to route to Ollama Cloud.

## Thinking mode (`think`)

Supported on `gpt-oss:*`, `glm-4.6:*`, and `qwen3*` models. Ollama Cloud accepts:

- `true` / `false`
- `"high"`, `"medium"`, `"low"`

The dedicated chat forwarder preserves `think`, `reasoning_effort`, `options`, and `keep_alive` unchanged.

## Compatibility layers

| Layer | Upstream path |
|-------|---------------|
| OpenAI chat | `POST /v1/chat/completions` |
| Anthropic messages | `POST /v1/messages` |
| Native generate | `POST /api/generate` (NDJSON when streaming) |
| Native embed | `POST /api/embed` |
| Model list | `GET /api/tags` |
| Running models | `GET /api/ps` |
| Model info | `POST /api/show` |
| Version | `GET /api/version` |

## Proxy endpoints

| Endpoint | Upstream | Auth |
|----------|----------|------|
| `POST /v1/providers/ollama-cloud/generate` | `POST /api/generate` | `OLLAMA_API_KEY` or Bearer |
| `POST /v1/providers/ollama-cloud/embed` | `POST /api/embed` | Same |
| `GET /v1/providers/ollama-cloud/version` | `GET /api/version` | Same |
| `GET /v1/providers/ollama-cloud/tags` | `GET /api/tags` | Same |
| `GET /v1/providers/ollama-cloud/ps` | `GET /api/ps` | Same |
| `POST /v1/providers/ollama-cloud/show` | `POST /api/show` | Same |
| `POST /v1/providers/ollama-cloud/messages` | `POST /v1/messages` | Same |

NDJSON streaming responses from `/api/generate` are piped through with upstream `content-type` preserved.

## Usage mapping

Native Ollama usage fields map to telemetry tokens:

| Ollama field | Mapped field |
|--------------|--------------|
| `prompt_eval_count` | `input_tokens` |
| `eval_count` | `output_tokens` |
| `total_duration` | `total_duration_ns` |

OpenAI-compat chat streaming emits `usage.prompt_tokens` / `completion_tokens` at end of stream (existing SSE pipeline).

## Error mapping

Upstream failures with a parseable body normalize to `{ error, hint }`:

| Status | Hint |
|--------|------|
| 400 | Invalid request — check parameters and JSON shape |
| 401 | Authentication failed — verify OLLAMA_API_KEY |
| 404 | Model not found — pull or check the model name |
| 429 | Rate limited — back off and retry |
| 500 | Server error — retry after a brief wait |
| 502 | Cloud model unreachable — try again or pick another model |

## Pricing (approximate)

Ollama Cloud uses subscription pricing; telemetry uses representative per-token estimates:

| Model | Input ($/1M) | Output ($/1M) |
|-------|--------------|---------------|
| `gpt-oss:20b` | 0.10 | 0.30 |
| `gpt-oss:120b` | 0.50 | 1.50 |
| `deepseek-v3.1:671b` | 0.30 | 1.20 |
| `qwen3-coder:480b` | 0.30 | 1.20 |
| `qwen3-vl:235b` | 0.20 | 0.80 |
| `kimi-k2:1t` | 0.50 | 1.50 |
| `minimax-m2:230b` | 0.20 | 0.80 |
| `glm-4.6:cloud` | 0.30 | 1.20 |
| Embed models | 0.02 | 0 |

Override via `MODEL_PRICING` in telemetry or local cost config if your plan differs.

## References

- [Ollama Cloud docs](https://ollama.com/cloud)
- Module: [`src/providers/ollama-cloud.ts`](../../src/providers/ollama-cloud.ts)
- Routes: [`src/api/ollama-cloud-routes.ts`](../../src/api/ollama-cloud-routes.ts)
