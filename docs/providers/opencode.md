# OpenCode agent server

Control a **local OpenCode server** via `@opencode-ai/sdk` through Trestle proxy routes.

The proxy does **not** spawn OpenCode — run the OpenCode server separately (default `http://127.0.0.1:4096`).

## Config

`~/.trestle/config.json`:

```json
{
  "providers": {
    "opencode": {
      "baseUrl": "http://127.0.0.1:4096"
    }
  }
}
```

Or set `OPENCODE_SERVER_URL`.

## Routes (`/v1/providers/opencode/*`)

| Route | Description |
|-------|-------------|
| `GET /ping` | Server health (`GET /global/health`) |
| `GET /config` | OpenCode config |
| `GET /config/providers` | Provider list + defaults |
| `GET /projects` | List projects |
| `GET /projects/current` | Current project |
| `GET/POST /sessions` | List / create sessions |
| `GET/DELETE /sessions/:id` | Get / delete session |
| `POST /sessions/:id/prompt` | Send prompt |
| `POST /sessions/:id/abort` | Abort session |
| `GET /sessions/:id/messages` | Session messages |
| `GET /find/text` | Search file contents |
| `GET /find/files` | Find files by name |
| `GET /file` | Read file |
| `GET /events` | SSE event stream |

## Example

```bash
curl http://localhost:4100/v1/providers/opencode/ping
curl http://localhost:4100/v1/providers/opencode/sessions
```

See also: [OpenCode SDK docs](https://opencode.ai/docs/sdk/)
