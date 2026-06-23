# GitHub Copilot → Trestle Proxy

Use Trestle as an OpenAI-compatible front-end for the GitHub Copilot SDK agent.

See [docs/providers/copilot.md](../providers/copilot.md) for auth, sticky sessions, and SDK routes.

## Quick start

```bash
export COPILOT_GITHUB_TOKEN=ghp_...   # or GITHUB_TOKEN
trestle start
```

```bash
curl -s http://localhost:4100/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "copilot/auto",
    "messages": [{"role": "user", "content": "Summarize README.md"}]
  }'
```

Save `X-Copilot-Session-Id` from the response headers for follow-up turns.

## Node version

Copilot SDK requires **Node.js >=20.19.0**. Upgrade Node before installing or running the proxy with Copilot enabled.

## Tool approvals

The proxy defaults to `approveAllTools: true` so headless automation does not block on permission prompts. Disable in config only if you implement custom permission handling.

## vs Cursor / Codex

| Tool | Integration |
|------|-------------|
| Cursor Agent | Points **at** the proxy via `ANTHROPIC_BASE_URL` — see [cursor-agent.md](cursor-agent.md) |
| Codex CLI | Uses `POST /v1/responses` — see [codex.md](codex.md) |
| Copilot SDK | Uses `copilot/*` models or `/v1/providers/copilot/*` routes |
