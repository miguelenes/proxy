# Google Antigravity

Managed sandbox agent via the [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/antigravity-agent) (`@google/genai`).

## Auth

```bash
export GEMINI_API_KEY=your_key
```

## Chat models

```json
{ "model": "antigravity/antigravity-preview-05-2026", "messages": [...] }
```

Multi-turn: pass headers from the prior response:

- `X-Antigravity-Interaction-Id`
- `X-Antigravity-Environment-Id`

## Routes (`/v1/providers/antigravity/*`)

| Route | Description |
|-------|-------------|
| `GET /ping` | Agent metadata |
| `POST /interactions` | Create interaction (passthrough body) |
| `GET /interactions/:id` | Get interaction |
| `DELETE /interactions/:id` | Cancel interaction |

Default agent: `antigravity-preview-05-2026` with `environment: remote`.
