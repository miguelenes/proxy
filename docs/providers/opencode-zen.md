# OpenCode Zen

[OpenCode Zen](https://opencode.ai/docs/zen/) is a hosted model API. Trestle routes each model to the correct upstream protocol (responses, messages, chat, or Gemini).

## Auth

```bash
export OPENCODE_ZEN_API_KEY=your_zen_key
```

Keys from the [Zen console](https://opencode.ai/zen). Bearer passthrough from `Authorization: Bearer` is supported.

## Model prefix

Use `opencode/{model-id}` in chat requests:

```json
{
  "model": "opencode/claude-sonnet-4-6",
  "messages": [{ "role": "user", "content": "Hello" }]
}
```

## Protocol routing

| Protocol | Models (examples) | Upstream path |
|----------|-------------------|---------------|
| `anthropic` | `claude-*` | `/v1/messages` |
| `responses` | `gpt-*` | `/v1/responses` |
| `chat` | `deepseek-*`, `glm-*`, `kimi-*`, … | `/v1/chat/completions` |
| `gemini` | `gemini-*` | `/v1/models/{id}:generateContent` |

**Important:** Claude and GPT models must not use `/chat/completions` on Zen — the proxy selects the path automatically.

### Tier quirks

- **MiniMax M2.5 / M2.7 on Zen** → chat completions
- Same models on **Go** → messages (see [opencode-go.md](opencode-go.md))

## Metadata

```bash
curl http://localhost:4100/v1/providers/opencode-zen/models \
  -H "Authorization: Bearer $OPENCODE_ZEN_API_KEY"
```

## Config override

```json
{
  "providers": {
    "opencode-zen": {
      "baseUrl": "https://opencode.ai/zen/v1"
    }
  }
}
```

Pricing: [opencode.ai/zen](https://opencode.ai/zen)
