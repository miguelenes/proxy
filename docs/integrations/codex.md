# Codex CLI → Trestle Proxy

Codex requires `wire_api = "responses"`. Point it at the proxy's `/v1/responses` endpoint.

## Option A: Custom provider in `~/.codex/config.toml`

```toml
model = "gpt-4o-mini"
model_provider = "relayplane"

[model_providers.relayplane]
name = "Trestle Proxy"
base_url = "http://localhost:4100"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```

```bash
export OPENAI_API_KEY="your-upstream-key-or-dummy-if-passthrough"
codex
```

## Option B: OpenAI base URL override

If using only OpenAI models through the proxy:

```toml
openai_base_url = "http://localhost:4100"
```

Note: Codex 0.122+ requires Responses API support on the base URL.

## Docker

```toml
base_url = "http://localhost:4100"
```

When Codex runs on the host and proxy in Docker, `localhost:4100` is correct (published port).
