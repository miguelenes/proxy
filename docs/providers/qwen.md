# Qwen / DashScope Cloud

Alibaba DashScope OpenAI-compatible chat and metadata APIs via provider id `qwen`.

## Auth

```bash
export DASHSCOPE_API_KEY=sk-...
```

Or pass `Authorization: Bearer <key>` on requests.

## Region

In `~/.trestle/config.json`:

```json
{
  "providers": {
    "qwen": { "region": "international" }
  }
}
```

| Region | Base URL |
|--------|----------|
| `international` (default) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| `china` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `us` | `https://dashscope-us.aliyuncs.com/compatible-mode/v1` |
| `hongkong` | `https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1` |

Override with `providers.qwen.baseUrl` if needed. Explicit `baseUrl` wins over `region`.

## Models

Use slash notation:

```
qwen/qwen-plus
qwen/qwen-max
qwen/qwen3.5-plus
```

The proxy strips the `qwen/` prefix before forwarding to DashScope.

## Qwen3 thinking

For non-streaming Qwen3 models, DashScope may require `enable_thinking: false` when reasoning is off. The proxy injects this default unless you set `enable_thinking` explicitly or enable `providers.qwen.enableThinking`.

## Proxy routes

| Route | Upstream |
|-------|----------|
| `GET /v1/providers/qwen/ping` | models probe |
| `GET /v1/providers/qwen/models` | `GET /models` |

## Chat

Standard OpenAI client pointed at the proxy:

```bash
export OPENAI_BASE_URL=http://localhost:4100/v1
export OPENAI_API_KEY=$DASHSCOPE_API_KEY
```

```json
{ "model": "qwen/qwen-plus", "messages": [...] }
```

## References

- [DashScope console](https://dashscope.console.aliyun.com/)
- [Compatible-mode API](https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope)
