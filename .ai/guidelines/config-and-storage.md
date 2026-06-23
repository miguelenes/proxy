# Configuration & Local Storage

All persistent user data defaults to **`~/.trestle/`**. Override with `TRESTLE_CONFIG_PATH` (directory or file path depending on operation — see `config.ts`).

## Directory layout

```text
~/.trestle/
├── config.json          # Main proxy settings
├── policy.yaml          # Per-agent routing policy (optional)
├── stats.json           # Aggregated usage
├── telemetry.jsonl      # Local telemetry events
├── telemetry/           # Batched cloud upload queue
├── routing-log.jsonl    # Routing decision log (when enabled)
└── backups/             # Atomic config write backups
```

## config.json (essential fields)

Schema defined in `src/config.ts`. Deep-merge with defaults — only specify overrides.

### Core

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Master switch |
| `modelOverrides` | `{}` | Map requested model → replacement |
| `routing.mode` | passthrough | `auto`, `complexity`, `cascade`, or passthrough |
| `routing.complexity` | disabled | Tier → model mapping |
| `routing.cascade` | disabled | Ordered model list + escalation rules |

### Providers & auth

```json
{
  "providers": {
    "anthropic": {
      "accounts": [
        { "label": "primary", "apiKey": "sk-ant-...", "priority": 0 }
      ],
      "rateLimit": { "rpm": 100 }
    }
  },
  "auth": {
    "anthropicMaxToken": "sk-ant-oat-...",
    "useMaxForModels": ["opus", "claude-opus"]
  }
}
```

- **accounts[]** — multi-token pool; lower `priority` tried first
- **auth** — hybrid Max plan: OAuth token for expensive models, API key for others

### Budget

```json
{
  "budget": {
    "dailyLimitUsd": 10,
    "hourlyLimitUsd": 2,
    "perRequestLimitUsd": 0.5,
    "onBreach": "downgrade"
  }
}
```

`onBreach`: `block` | `warn` | `downgrade` | `alert`

### Reliability

```json
{
  "reliability": {
    "cooldowns": {
      "enabled": true,
      "allowedFails": 3,
      "windowSeconds": 60,
      "cooldownSeconds": 120
    }
  },
  "crossProviderCascade": {
    "enabled": false,
    "providers": ["anthropic", "openrouter", "google"],
    "triggerStatuses": [429, 529, 503]
  }
}
```

### Mesh & telemetry

```json
{
  "mesh": {
    "enabled": true,
    "endpoint": "...",
    "contribute": true
  }
}
```

CLI toggles:

```bash
trestle telemetry on|off|status
trestle mesh on|off|status
```

## policy.yaml

Loaded by `agent-policy.ts`. Per-agent and per-task routing overrides.

```yaml
version: 1
agents:
  my-coding-agent:
    preferred: anthropic/claude-sonnet-4-6
    neverDowngrade: true
    tasks:
      code_review:
        preferred: anthropic/claude-opus-4-6
tasks:
  quick_task:
    preferred: anthropic/claude-haiku-4-5
```

Resolution order documented in `PolicyResolution.resolvedBy`:

`agent_task_override` → `task_rule` → `agent_rule` → `complexity_routing` → `default_routing` → `passthrough`

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required for Haiku when client sends OAuth) |
| `OPENAI_API_KEY` | OpenAI |
| `GEMINI_API_KEY` | Google Gemini |
| `XAI_API_KEY` | xAI/Grok |
| `OPENROUTER_API_KEY` | OpenRouter |
| `TRESTLE_CONFIG_PATH` | Custom config location |

## CLI config commands

```bash
trestle init              # First-run setup
relayplane config            # Show effective config
relayplane enable|disable    # Routing master toggle
trestle policy analyze    # Suggest policy from traffic
```

Dashboard config editor: `http://localhost:4100/dashboard/config`

## Model ID conventions

- Use **undated** Anthropic IDs in config: `claude-haiku-4-5`, not `claude-haiku-4-5-20250514`
- Dated IDs are for Bedrock/Vertex; undated IDs 404 on direct API when wrong format used

## Config resilience

`config.ts` implements atomic writes with backup/restore. Credentials can be separated from main config for security.

## Integration with OpenClaw

```bash
openclaw config set models.providers.anthropic.baseUrl http://localhost:4100
```

**Gotcha:** `~/.openclaw/agents/{id}/config.json` model field overrides global `openclaw.json`.

## Integration with Cursor / Claude Code

```bash
export ANTHROPIC_BASE_URL=http://localhost:4100
export OPENAI_BASE_URL=http://localhost:4100
```

Claude Code auto-start hook:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "relayplane ensure-running" }] }]
  }
}
```

Place in `~/.claude/settings.json`.
