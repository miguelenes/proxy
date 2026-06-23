# OpenCode Go

[OpenCode Go](https://opencode.ai/docs/go/) is a subscription tier with a separate API base and model set.

## Auth

```bash
export OPENCODE_GO_API_KEY=your_go_key
# or reuse Zen key:
export OPENCODE_ZEN_API_KEY=your_zen_key
```

Go API keys are issued from the Zen console; `OPENCODE_GO_API_KEY` is preferred, with fallback to `OPENCODE_ZEN_API_KEY`.

## Model prefix

```json
{
  "model": "opencode-go/glm-5.2",
  "messages": [{ "role": "user", "content": "Hello" }]
}
```

## Base URL

Default: `https://opencode.ai/zen/go/v1`

## Protocol differences vs Zen

| Model | Zen | Go |
|-------|-----|-----|
| MiniMax M2.5 / M2.7 | chat | messages |
| Qwen3.7 Plus / Max | — | messages |
| DeepSeek V4, MiMo, GLM 5.2 | chat | chat |

Trestle applies the Go protocol table automatically when the model prefix is `opencode-go/`.

## Metadata

```bash
curl http://localhost:4100/v1/providers/opencode-go/models \
  -H "Authorization: Bearer $OPENCODE_GO_API_KEY"
```

## Config

```json
{
  "providers": {
    "opencode-go": {
      "baseUrl": "https://opencode.ai/zen/go/v1"
    }
  }
}
```
