# Google ADK

Local agent execution via [@google/adk](https://github.com/google/adk-js) (`LlmAgent`, `InMemoryRunner`, sessions).

## Auth

```bash
export GEMINI_API_KEY=your_key
```

## Chat models

```json
{ "model": "google-adk/gemini-2.5-flash", "messages": [...] }
```

Sticky sessions: pass `X-Google-Adk-Session-Id` on follow-up requests.

## Routes (`/v1/providers/google-adk/*`)

| Route | Description |
|-------|-------------|
| `GET /ping` | ADK version |
| `GET/POST /sessions` | List / create sessions |
| `GET/DELETE /sessions/:id` | Get / delete session |
| `POST /sessions/:id/run` | Run agent in session |
| `POST /run` | Ephemeral one-shot run |

Docs: [adk.dev](https://adk.dev/get-started/about/)
