# Trestle Proxy — Architecture Overview

## What this is

`@trestle/proxy` is a **local HTTP proxy** for LLM APIs. AI tools send requests to `localhost:4100` instead of `api.anthropic.com` or `api.openai.com`. The proxy:

1. Optionally changes the target model (cost optimization)
2. Tracks spend, latency, and routing decisions locally
3. Forwards the **original prompt** to the real provider

No Docker. No Python. Node.js + TypeScript. MIT licensed.

## System diagram

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   AI Tool   │────▶│  Trestle      │────▶│   LLM API   │
│ Cursor etc. │◀────│  localhost:4100  │◀────│ Anthropic/  │
└─────────────┘     └──────────────────┘     │ OpenAI/...  │
                           │                  └─────────────┘
                           ▼
                    ┌──────────────┐
                    │ Task Type +  │
                    │ Complexity   │
                    │ Model Router │
                    └──────────────┘
                           │
                           ▼
                    ~/.trestle/
                    (config, stats, telemetry)
```

## Code layout

Almost all runtime logic is in flat `src/*.ts` files. The dominant file is **`standalone-proxy.ts`** (~7,700 lines) — treat it as the monolith to understand first, then extract when adding features.

| Layer | Files |
|-------|-------|
| CLI | `cli.ts` |
| HTTP server | `standalone-proxy.ts` |
| Public API | `index.ts` |
| Config | `config.ts`, `relay-config.ts`, `helpers/config-loader.ts` |
| Policy | `agent-policy.ts`, `policy-analyzer.ts`, `policy-suggestions.ts` |
| Providers | Forwarding logic inside `standalone-proxy.ts`; `ollama.ts` for local |
| Packages | `@relayplane/core`, `@relayplane/learning-engine`; optional `@relayplane/routing-engine`, etc. |

Build output: `dist/`. `tsconfig.json` **excludes** `server.ts` and `streaming.ts` from compilation.

## Request lifecycle

Detailed order inside the Anthropic/OpenAI handler:

1. **Parse** JSON body; detect streaming
2. **Cache** — `response-cache.ts`; header `X-Trestle-Cache: HIT|MISS`
3. **Budget** — `budget.ts`; may block or trigger `downgrade.ts`
4. **Anomaly** — `anomaly.ts`; runaway loop detection
5. **Classify** — always runs:
   - `inferTaskType` from `@relayplane/core` (prompt text) or `telemetry.ts` (token stats)
   - `classifyComplexity(messages)` — last user message + context floor
6. **Route** — resolve model:
   - Passthrough (default)
   - `modelOverrides`
   - `routing.mode`: `auto` | `complexity` | `cascade`
   - `agent-policy.ts` / `policy.yaml`
   - Smart aliases: `rp:fast`, `relayplane:auto`
7. **Auth** — `getAuthForModel`, `buildAnthropicHeadersWithAuth`, `token-pool.ts`
8. **Forward** — native Anthropic or OpenAI HTTP; streaming via `streaming` helpers in standalone-proxy
9. **Record** — telemetry, cost ledger, routing log, agent fingerprint

## Classification details

### Task type (telemetry label)

From [relayplane.com/docs/proxy/how-it-works](https://relayplane.com/docs/proxy/how-it-works):

- Uses token counts, ratios, tool presence — **not prompt content** for cloud telemetry
- Examples: `tool_use`, `quick_task`, `long_context`, `generation`, `classification`

### Complexity (routing)

`classifyComplexity()` in `standalone-proxy.ts`:

- Primary signal: **last user message** text patterns (code, analyze, implement, …)
- Context floor: total tokens across all messages (>20k, >50k, >100k bumps score)
- Message count: long threads → higher complexity
- Returns `simple` | `moderate` | `complex`

**Critical fix (shipped):** Do not score system prompts — agent workloads embed huge AGENTS.md/SOUL.md in system role.

## Routing configuration

File: `~/.trestle/config.json` (see `config.ts` for full schema).

```json
{
  "enabled": true,
  "routing": {
    "mode": "passthrough",
    "complexity": {
      "enabled": true,
      "simple": "claude-haiku-4-5",
      "moderate": "claude-sonnet-4-6",
      "complex": "claude-opus-4-6"
    },
    "cascade": {
      "enabled": true,
      "models": ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
      "escalateOn": "uncertainty",
      "maxEscalations": 1
    }
  },
  "modelOverrides": {},
  "providers": {
    "anthropic": {
      "accounts": [
        { "label": "max", "apiKey": "sk-ant-oat-...", "priority": 0 }
      ]
    }
  }
}
```

Policy overrides: `~/.trestle/policy.yaml` — per-agent and per-task-type preferred models.

## Auth matrix (Anthropic)

| Setup | Haiku | Sonnet | Opus |
|-------|-------|--------|------|
| API key only | OK | OK | OK |
| OAuth/Max only | **Fails** | OK | OK |
| OAuth + `ANTHROPIC_API_KEY` | OK (env key) | OK (OAuth) | OK (OAuth) |

OAuth tokens (`sk-ant-oat*`) use `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`.
API keys use `x-api-key`.

When auto-routing downgrades to Haiku with an OAuth client token, proxy must swap to `ANTHROPIC_API_KEY`. Documented in `AUTO-ROUTING-NOTES.md`; implementation incomplete.

## Credential quarantine

- 2 consecutive HTTP 401 on a credential → quarantine 1 hour
- Token pool tries next `providers.anthropic.accounts[]` entry
- 429 → retry with next token; learn limits from `anthropic-ratelimit-*` headers

## Telemetry & mesh

- **Telemetry** (default on): metadata to `api.relayplane.com` — never prompts
- **Mesh** (default on): anonymized routing signals for collective learning — `trestle mesh off` to disable
- **Local**: `telemetry.jsonl`, dashboard at `:4100`
- **Audit**: `trestle start --audit`
- **Offline**: `trestle start --offline`

## Supported providers

Anthropic, OpenAI, Google Gemini, xAI/Grok, OpenRouter, DeepSeek, Groq, Mistral, Together, Fireworks, Perplexity — routing and auth differ per provider; Anthropic path is most mature.

## Dashboard & APIs

- UI: `http://localhost:4100` — cost by model/agent, request history, token pool
- `GET /v1/telemetry/stats`, `/v1/telemetry/runs`, `/v1/telemetry/savings`, `/v1/telemetry/health`
- `GET /v1/token-pool/status`

## Dependencies

**Required:** `@relayplane/core`, `@relayplane/learning-engine`, `better-sqlite3`, `js-yaml`, `fastest-levenshtein`

**Optional:** `@relayplane/auth-gate`, `@relayplane/ledger`, `@relayplane/policy-engine`, `@relayplane/routing-engine`, `@relayplane/explainability`

## Related docs in repo

- [README.md](../../README.md) — user-facing feature list
- [AGENTS.md](../../AGENTS.md) — agent workflow and commands
- [AUTO-ROUTING-NOTES.md](../../AUTO-ROUTING-NOTES.md) — OAuth/Haiku routing blocker
- [CHANGELOG.md](../../CHANGELOG.md) — release notes (e.g. v1.9 token pool)
