# Qwen integration

Point AI clients at Trestle on port 4100.

## DashScope cloud (`qwen`)

Best for standard chat completions against DashScope compatible-mode:

```bash
export OPENAI_BASE_URL=http://localhost:4100/v1
export OPENAI_API_KEY=$DASHSCOPE_API_KEY
```

```json
{ "model": "qwen/qwen-plus", "messages": [...] }
```

See [docs/providers/qwen.md](../providers/qwen.md).

## Qwen Code agent (`qwen-agent`)

Best for local tool-using agent sessions (files, shell, MCP):

```bash
export OPENAI_BASE_URL=http://localhost:4100/v1
export OPENAI_API_KEY=$DASHSCOPE_API_KEY
```

```json
{ "model": "qwen-agent/qwen-plus", "messages": [...] }
```

Configure workspace in `~/.trestle/config.json`:

```json
{
  "providers": {
    "qwen-agent": {
      "cwd": "/path/to/project",
      "permissionMode": "yolo"
    }
  }
}
```

See [docs/providers/qwen-agent.md](../providers/qwen-agent.md).

## Choosing cloud vs agent

| Use case | Provider |
|----------|----------|
| Drop-in chat, embeddings-style workloads | `qwen/*` |
| Code editing, terminal tools, MCP | `qwen-agent/*` |
