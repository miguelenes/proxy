# Cursor Agent → Trestle Proxy

Point Cursor's Anthropic/OpenAI traffic at the local proxy.

For Cursor **team Admin / Analytics / Code Tracking** APIs (not LLM routing), see [docs/providers/cursor.md](../providers/cursor.md).

```bash
export ANTHROPIC_BASE_URL=http://localhost:4100
export OPENAI_BASE_URL=http://localhost:4100
```

Start the proxy:

```bash
trestle start
# or: docker compose up -d
```

Cursor Agent CLI uses the same env vars as Cursor IDE when configured for custom endpoints.

## z.ai / GLM via proxy

Request models with the `glm-*` prefix or `zai/glm-5.2` slash form. Set `ZAI_API_KEY` in the proxy environment.

## Routing

Enable cost routing in `~/.trestle/config.json`:

```json
{
  "routing": { "mode": "auto" }
}
```
