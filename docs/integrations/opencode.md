# OpenCode → Trestle Proxy

## Client: route OpenCode through the proxy

Add to `~/.config/opencode/opencode.json` or project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "relayplane": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Trestle Proxy",
      "options": {
        "baseURL": "http://localhost:4100/v1"
      },
      "models": {
        "relayplane:auto": { "name": "Auto route" },
        "claude-sonnet-4-6": { "name": "Claude Sonnet" }
      }
    }
  }
}
```

**Important:** `baseURL` must include `/v1` suffix.

Then run `/connect` in OpenCode and select the `relayplane` provider.

## Zen / Go cloud models via proxy

Use OpenCode-hosted models without pointing OpenCode at Zen directly:

```bash
export OPENCODE_ZEN_API_KEY=your_key
# optional Go tier:
export OPENCODE_GO_API_KEY=your_key
```

Chat completions examples:

```json
{ "model": "opencode/claude-sonnet-4-6", "messages": [...] }
{ "model": "opencode/gpt-5.4", "messages": [...] }
{ "model": "opencode-go/glm-5.2", "messages": [...] }
```

- Zen docs: [docs/providers/opencode-zen.md](../providers/opencode-zen.md)
- Go docs: [docs/providers/opencode-go.md](../providers/opencode-go.md)

## Control local OpenCode server via proxy

If OpenCode is running on `:4096`, use proxy control routes:

```bash
curl http://localhost:4100/v1/providers/opencode/ping
curl http://localhost:4100/v1/providers/opencode/sessions
```

Configure `providers.opencode.baseUrl` in `~/.trestle/config.json`. See [docs/providers/opencode.md](../providers/opencode.md).

## Anthropic via proxy

```json
{
  "provider": {
    "anthropic": {
      "options": {
        "baseURL": "http://localhost:4100"
      }
    }
  }
}
```

Use `http://localhost:4100/v1` if OpenCode appends paths without `/v1`.
