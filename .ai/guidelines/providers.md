# Provider reference

Per-provider endpoints, env keys, and implementation status in this fork.

## Full forwarding (OpenAI-compatible)

| Provider | Env key | Base URL | Model prefixes |
|----------|---------|----------|----------------|
| Mistral | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1` | `mistral-*`, `codestral*`, `magistral*`, `ministral*` |
| Groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` | `groq-*`, `groq/` |

## Dedicated modules

| Provider | Module | Notes |
|----------|--------|-------|
| DeepSeek | [`src/providers/deepseek.ts`](../../src/providers/deepseek.ts) | v4-flash/pro, prefix completion, thinking mode, KV cache pricing — see [docs/providers/deepseek.md](../../docs/providers/deepseek.md) |
| z.ai / GLM | [`src/providers/zai.ts`](../../src/providers/zai.ts) | Full GLM family, thinking/multimodal, tools/media/agents routes — see [docs/providers/zai.md](../../docs/providers/zai.md) |
| Ollama Cloud | [`src/providers/ollama-cloud.ts`](../../src/providers/ollama-cloud.ts) | Native `/api/*`, think support, OpenAI + Anthropic compat — see [docs/providers/ollama-cloud.md](../../docs/providers/ollama-cloud.md) |
| NVIDIA NIM | [`src/providers/nvidia.ts`](../../src/providers/nvidia.ts) | Nemotron reasoning, embeddings, reranking — see [docs/providers/nvidia.md](../../docs/providers/nvidia.md) |
| Ollama (local) | [`src/providers/ollama.ts`](../../src/providers/ollama.ts) | Native `/api/chat` adapter |
| Devin | [`src/providers/devin.ts`](../../src/providers/devin.ts) | v3 sessions, knowledge, metrics, consumption — see [docs/providers/devin.md](../../docs/providers/devin.md) |
| Cursor team API | [`src/providers/cursor.ts`](../../src/providers/cursor.ts) | Admin, Analytics, AI Code Tracking — see [docs/providers/cursor.md](../../docs/providers/cursor.md) |
| GitHub Copilot | [`src/providers/copilot.ts`](../../src/providers/copilot.ts) | Copilot SDK CLI, sticky sessions — see [docs/providers/copilot.md](../../docs/providers/copilot.md) |
| Kimi / Moonshot | [`src/providers/kimi.ts`](../../src/providers/kimi.ts) | Cloud chat + balance/models/files — see [docs/providers/kimi.md](../../docs/providers/kimi.md) |
| Kimi Agent SDK | [`src/providers/kimi-agent.ts`](../../src/providers/kimi-agent.ts) | Local `kimi` CLI sessions — see [docs/providers/kimi-agent.md](../../docs/providers/kimi-agent.md) |
| Qwen / DashScope | [`src/providers/qwen.ts`](../../src/providers/qwen.ts) | Cloud chat + models — see [docs/providers/qwen.md](../../docs/providers/qwen.md) |
| Qwen Agent SDK | [`src/providers/qwen-agent.ts`](../../src/providers/qwen-agent.ts) | Local Qwen Code via `@qwen-code/sdk` — see [docs/providers/qwen-agent.md](../../docs/providers/qwen-agent.md) |
| OpenRouter | [`src/providers/openrouter.ts`](../../src/providers/openrouter.ts) | Official TypeScript SDK, models/credits/generations — see [docs/providers/openrouter.md](../../docs/providers/openrouter.md) |
| OpenCode Zen | [`src/providers/opencode-zen.ts`](../../src/providers/opencode-zen.ts) | Per-model protocol routing to Zen API — see [docs/providers/opencode-zen.md](../../docs/providers/opencode-zen.md) |
| OpenCode Go | [`src/providers/opencode-go.ts`](../../src/providers/opencode-go.ts) | Go subscription tier — see [docs/providers/opencode-go.md](../../docs/providers/opencode-go.md) |
| OpenCode server | [`src/providers/opencode.ts`](../../src/providers/opencode.ts) | Local agent server SDK — see [docs/providers/opencode.md](../../docs/providers/opencode.md) |
| Azure Foundry | [`src/providers/azure-foundry.ts`](../../src/providers/azure-foundry.ts) | `@azure/ai-projects` + dual auth — see [docs/providers/azure-foundry.md](../../docs/providers/azure-foundry.md) |
| Google ADK | [`src/providers/google-adk.ts`](../../src/providers/google-adk.ts) | `@google/adk` agents — see [docs/providers/google-adk.md](../../docs/providers/google-adk.md) |
| Antigravity | [`src/providers/antigravity.ts`](../../src/providers/antigravity.ts) | Managed Gemini agent — see [docs/providers/antigravity.md](../../docs/providers/antigravity.md) |
| AGY | [`src/providers/agy.ts`](../../src/providers/agy.ts) | ADK coding agent client — see [docs/providers/agy.md](../../docs/providers/agy.md) |

Override base URL in `~/.trestle/config.json`:

```json
{
  "providers": {
    "nvidia": { "baseUrl": "https://integrate.api.nvidia.com/v1" }
  }
}
```

## Scaffold / partial

| Provider | Status | Notes |
|----------|--------|-------|
| Google Antigravity | Dedicated module | `antigravity/*` → Interactions API; `agy/*` → ADK agent; `google-adk/*` → ADK Runner |

## Agent CLIs (clients)

These tools point **at** the proxy — they are not upstream providers.

| Tool | Config |
|------|--------|
| Codex CLI | `POST /v1/responses` on proxy; see [docs/integrations/codex.md](../../docs/integrations/codex.md) |
| Cursor Agent | `ANTHROPIC_BASE_URL=http://localhost:4100` |
| OpenCode | Client via `opencode.json`; Zen/Go models `opencode/*`, `opencode-go/*`; server control `/v1/providers/opencode/*` — [docs/integrations/opencode.md](../../docs/integrations/opencode.md) |
| Kimi Code | Cloud `kimi/*` or agent `kimi-agent/*` — [docs/integrations/kimi.md](../../docs/integrations/kimi.md) |
| Qwen Code | Cloud `qwen/*` or agent `qwen-agent/*` — [docs/integrations/qwen.md](../../docs/integrations/qwen.md) |
| Devin CLI | Use `devin` provider via chat completions |

## Adding a provider (checklist)

1. Add to `DEFAULT_ENDPOINTS` in [src/providers/registry.ts](../../src/providers/registry.ts)
2. Extend `Provider` union in [src/standalone-proxy.ts](../../src/standalone-proxy.ts)
3. Add prefix rules in `resolveExplicitModel()`
4. Add to `VALID_SLASH_PROVIDERS` in `registry.ts`
5. Wire dispatch in `executeNonStreamingProviderRequest` + `handleStreamingRequest`
6. Update `detectAvailableProviders()`, `MODEL_PRICING`, `PROVIDER_LIMIT_DEFAULTS`
7. Add tests in `__tests__/providers.test.ts`, `default-provider.test.ts`, or provider-specific tests

## Registry layout

```
src/providers/
  registry.ts   — DEFAULT_ENDPOINTS, getProviderEndpoint
  shared.ts     — forwardOpenAiCompatible, Azure Foundry, Copilot scaffold
  deepseek.ts   — dedicated DeepSeek forwarding
  zai.ts        — dedicated z.ai / GLM forwarding + API clients
  ollama-cloud.ts — dedicated Ollama Cloud forwarding + native API clients
  nvidia.ts     — dedicated NVIDIA NIM forwarding + embed/rank clients
  ollama.ts     — local Ollama
  devin.ts      — Devin v3 client + chat session adapter
  cursor.ts     — Cursor Admin/Analytics/Code Tracking REST client
  index.ts      — re-exports

src/api/
  devin-routes.ts — /v1/providers/devin/* proxy dispatcher
  cursor-routes.ts — /v1/providers/cursor/* allowlisted forwarder
```

`forwardToOpenAICompatible` receives `targetProvider` so Groq/Mistral/etc. hit their own base URLs instead of defaulting to OpenRouter.
