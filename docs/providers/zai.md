# z.ai (GLM) provider

Dedicated z.ai integration in `src/providers/zai.ts` with full chat forwarding plus passthrough routes for tools, media, and agents.

## Configuration

| Setting | Value |
|---------|-------|
| Env key | `ZAI_API_KEY` |
| Base URL | `https://api.z.ai/api` |
| Chat endpoint | `POST /paas/v4/chat/completions` |
| Auth | `Authorization: Bearer ${ZAI_API_KEY}` |
| Locale header | `Accept-Language: en-US,en` (default) |

Override base URL via `providers.zai.baseUrl` in `~/.trestle/config.json` (default resolves to `https://api.z.ai/api/paas/v4`).

## Canonical models

### Text

`glm-5.2`, `glm-5.1`, `glm-5-turbo`, `glm-5`, `glm-4.7`, `glm-4.7-flash`, `glm-4.7-flashx`, `glm-4.6`, `glm-4.5`, `glm-4.5-air`, `glm-4.5-x`, `glm-4.5-airx`, `glm-4.5-flash`, `glm-4-32b-0414-128k`

### Vision

`glm-5v-turbo`, `glm-4.6v`, `glm-4.6v-flash`, `glm-4.6v-flashx`, `glm-4.5v`, `autoglm-phone-multilingual`

### OCR / Image / Video / Audio

| Family | Models |
|--------|--------|
| OCR | `glm-ocr` |
| Image | `glm-image`, `cogview-4-250304` |
| Video | `cogvideox-3`, `vidu-q1`, `vidu-q2` |
| Audio | `glm-asr-2512` |

## Short aliases

| Alias | Resolves to |
|-------|-------------|
| `zai`, `glm` | `glm-5.2` |
| `zai-flash`, `glm-flash` | `glm-4.7-flash` |
| `zai-vision` | `glm-5v-turbo` |
| `zai-ocr` | `glm-ocr` |
| `zai-image` | `glm-image` |
| `zai-video` | `cogvideox-3` |
| `zai-asr` | `glm-asr-2512` |

Prefix detection also routes `autoglm-*`, `cogvideox*`, `cogview-*`, `vidu-*` to z.ai.

## Thinking mode

z.ai uses a top-level `thinking` object (not DeepSeek's `extra_body.thinking`):

```json
{ "thinking": { "type": "enabled" } }
```

`reasoning_effort` on `glm-5.2`: `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none` (mapped server-side).

The dedicated chat forwarder preserves all z.ai-specific params unchanged.

## Multimodal messages

Vision models accept content arrays with:

- `{ "type": "text", "text": "..." }`
- `{ "type": "image_url", "image_url": { "url": "..." } }`
- `{ "type": "video_url", "video_url": { "url": "..." } }`
- `{ "type": "file_url", "file_url": { "url": "..." } }`

## Tools

Chat supports `function`, `web_search`, and `retrieval` tool types. `tool_stream: true` enables streaming function calls (GLM-4.6+).

## KV cache pricing

When usage includes `prompt_tokens_details.cached_tokens`, telemetry bills cache reads at ~10% of input rate:

| Model | Miss ($/1M) | Cache hit ($/1M) | Output ($/1M) |
|-------|-------------|------------------|---------------|
| `glm-5.2` | 0.60 | 0.06 | 2.00 |
| `glm-4.7-flash` | 0.10 | 0.01 | 0.30 |
| `glm-4.5-flash` | 0.05 | 0.005 | 0.20 |

Image/video/audio/OCR pricing in telemetry uses per-call estimates (no public per-token rates). Values are approximate.

## Proxy endpoints

| Proxy route | Upstream |
|-------------|----------|
| `POST /v1/providers/zai/tokenizer` | `POST /paas/v4/tokenizer` |
| `POST /v1/providers/zai/web-search` | `POST /paas/v4/web_search` |
| `POST /v1/providers/zai/reader` | `POST /paas/v4/reader` |
| `POST /v1/providers/zai/layout-parsing` | `POST /paas/v4/layout_parsing` |
| `POST /v1/providers/zai/images/generations` | `POST /paas/v4/images/generations` |
| `POST /v1/providers/zai/images/generations/async` | `POST /paas/v4/async/images/generations` |
| `GET /v1/providers/zai/async-result/:id` | `GET /paas/v4/async-result/{id}` |
| `POST /v1/providers/zai/videos/generations` | `POST /paas/v4/videos/generations` |
| `POST /v1/providers/zai/audio/transcriptions` | `POST /paas/v4/audio/transcriptions` (multipart, optional SSE) |
| `POST /v1/providers/zai/agents/conversation` | `POST /v1/agents/conversation` |
| `POST /v1/providers/zai/agents/async-result` | `POST /v1/agents/async-result` |
| `POST /v1/providers/zai/agents/file-upload` | `POST /paas/v4/files` |

Auth: `ZAI_API_KEY` env or `Authorization: Bearer` passthrough.

## Error codes

Responses normalize to `{ error, hint }` when upstream returns parseable JSON.

| HTTP | Biz code | Hint |
|------|----------|------|
| 401 | 1001–1004 | Authentication failed — verify ZAI_API_KEY |
| 400 | 1210–1215 | Invalid parameters |
| 429 | 1112–1113 | Account locked or in arrears |
| 429 | 1302–1305 | Rate limited |
| 429 | 1304/1308/1310 | Quota exhausted |
| 429 | 1309 | GLM Coding Plan expired |
| 429 | 1311 | Plan does not include model |
| 1301 | — | Content policy block |
| 500 | — | Server error — retry |

## Out of scope

- Anthropic-format API at z.ai `/anthropic` (TODO)

## References

- [z.ai API docs](https://docs.z.ai/api-reference/introduction)
- Module: [`src/providers/zai.ts`](../../src/providers/zai.ts)
- Routes: [`src/api/zai-routes.ts`](../../src/api/zai-routes.ts)
