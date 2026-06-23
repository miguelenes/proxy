# AGY (Antigravity-style client)

AGY workflows through Trestle use **@google/adk** with search + code execution tools — the same stack as [ADK TypeScript agents](https://adk.dev/get-started/typescript/).

For Google's **managed sandbox** agent, use the [`antigravity`](antigravity.md) provider instead.

## Auth

```bash
export GEMINI_API_KEY=your_key
```

## Chat models

```json
{ "model": "agy/gemini-2.5-flash", "messages": [...] }
```

Sticky sessions: `X-Agy-Session-Id`

## Routes (`/v1/providers/agy/*`)

Same shape as [google-adk](google-adk.md) sessions API, with AGY defaults (`relayplane-agy` app, coding-agent instruction).

| Route | Description |
|-------|-------------|
| `GET /ping` | Health + ADK version |
| `GET/POST /sessions` | Session list / create |
| `POST /sessions/:id/run` | Run coding agent turn |
