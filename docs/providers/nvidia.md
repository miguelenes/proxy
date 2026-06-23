# NVIDIA NIM provider

Dedicated NVIDIA NIM integration in `src/providers/nvidia.ts` with OpenAI-compat chat forwarding, embeddings, reranking, and models list.

## Configuration

| Setting | Value |
|---------|-------|
| Env key | `NVIDIA_API_KEY` |
| Base URL | `https://integrate.api.nvidia.com/v1` |
| Chat endpoint | `POST /v1/chat/completions` |
| Auth | `Authorization: Bearer ${NVIDIA_API_KEY}` |

Override base URL via `providers.nvidia.baseUrl` in `~/.trestle/config.json`.

## Model catalog

NIM hosts vendor-namespaced models. Use the full slug (e.g. `meta/llama-3.3-70b-instruct`) or a short alias below.

### NVIDIA Nemotron

`nvidia/nemotron-mini-4b-instruct`, `nvidia/nvidia-nemotron-nano-9b-v2`, `nvidia/nemotron-3-nano-30b-a3b`, `nvidia/nemotron-3-super-120b-a12b`, `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/llama-3.1-nemotron-nano-8b-v1`, `nvidia/llama-3.3-nemotron-super-49b-v1`, `nvidia/llama-3.3-nemotron-super-49b-v1.5`, `nvidia/llama-3.1-nemotron-ultra-253b-v1`, `nvidia/nemotron-content-safety-reasoning-4b`, plus Nemoguard and utility models.

### Third-party (via NIM)

Meta Llama, Qwen, DeepSeek, OpenAI gpt-oss, Mistral, Moonshot Kimi, Microsoft Phi, Google Gemma, minimax, z-ai GLM, and others — see [NIM LLM API docs](https://docs.api.nvidia.com/nim/reference/llm-apis).

### Embeddings

`baai/bge-m3`, `nvidia/llama-3.2-nv-embedqa-1b-v2`, `nvidia/nv-embedqa-e5-v5`

### Reranking

`nvidia/llama-3-2-nemoretriever-rerankqa-500m`, `nvidia/llama-3.2-nemoretriever-rerankqa-1b-v2`, `nvidia/nv-rerankqa-mistral-4b-v3`

## Short aliases

| Alias | Resolves to |
|-------|-------------|
| `nvidia` | `meta/llama-3.3-70b-instruct` |
| `nvidia-nano`, `nemotron-nano` | `nvidia/nemotron-3-nano-30b-a3b` |
| `nvidia-super`, `nemotron`, `nemotron-super` | `nvidia/nemotron-3-super-120b-a12b` |
| `nvidia-ultra`, `nemotron-ultra` | `nvidia/nemotron-3-ultra-550b-a55b` |
| `nvidia-reasoning` | `nvidia/llama-3.3-nemotron-super-49b-v1.5` |
| `nvidia-embed` | `nvidia/llama-3.2-nv-embedqa-1b-v2` |
| `nvidia-rerank` | `nvidia/llama-3.2-nemoretriever-rerankqa-1b-v2` |

Prefix detection also routes `nvidia/<model>` and model names containing `nemotron`.

Vendor-namespaced models (e.g. `meta/llama-3.3-70b-instruct`) require an explicit `nvidia/` prefix or short alias to route to NVIDIA NIM rather than the vendor's native provider.

## Nemotron reasoning

The dedicated chat forwarder preserves Nemotron-specific fields unchanged:

- `extra_body.thinking`
- `reasoning_effort`
- `nvext` extensions

Thinking-capable models include Nemotron super/ultra variants, `*-thinking` models, `phi-4-mini-flash-reasoning`, and `deepseek-v4-pro`.

## Tool calling and structured output

Tool calling (`tools`, `tool_choice`) and structured output (`response_format`) pass through via the OpenAI-compat shape on supported models.

## Proxy endpoints

| Endpoint | Upstream | Auth |
|----------|----------|------|
| `POST /v1/providers/nvidia/embeddings` | `POST /v1/embeddings` | `NVIDIA_API_KEY` or Bearer |
| `POST /v1/providers/nvidia/ranking` | `POST /v1/ranking` | Same |
| `GET /v1/providers/nvidia/models` | `GET /v1/models` | Same |

### Embeddings `input_type`

NIM embeddings support `input_type: "query"` or `"passage"` for retrieval pipelines, plus optional `truncate`.

### Reranking

`POST /v1/ranking` accepts query/passage pairs for NeMo Retriever rerankers. Returns relevance scores (logits).

## Error mapping

Upstream failures with a parseable body normalize to `{ error, hint }`:

| Status | Hint |
|--------|------|
| 400 | Invalid request — check parameters and JSON shape |
| 401 | Authentication failed — verify NVIDIA_API_KEY |
| 402 | Out of NIM credits — top up or upgrade plan |
| 403 | Model gated — accept terms at build.nvidia.com |
| 404 | Model not found — check the slug at /v1/models |
| 422 | Invalid parameters for this NIM |
| 429 | Rate limited — back off and retry |
| 500/503 | Server error — retry after a brief wait |

## Pricing (approximate)

NIM uses credit-pool billing; telemetry uses representative per-token estimates for relative cost tracking:

| Model tier | Input ($/1M) | Output ($/1M) |
|------------|--------------|---------------|
| Nano (4b–30b) | 0.05–0.15 | 0.10–0.45 |
| Super (49b–120b) | 0.30–0.50 | 0.90–1.50 |
| Ultra (253b–550b) | 0.80–1.20 | 2.40–3.60 |
| Embeddings | 0.02 | 0 |
| Reranking | 0.03–0.04 | 0 |

Override via `MODEL_PRICING` in telemetry if your plan differs.

## References

- [NIM LLM APIs](https://docs.api.nvidia.com/nim/reference/llm-apis)
- [NIM models overview](https://docs.api.nvidia.com/nim/reference/models-1)
- Module: [`src/providers/nvidia.ts`](../../src/providers/nvidia.ts)
- Routes: [`src/api/nvidia-routes.ts`](../../src/api/nvidia-routes.ts)
