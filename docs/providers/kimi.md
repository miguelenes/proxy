# Kimi / Moonshot Cloud

Moonshot OpenAI-compatible chat and metadata APIs via provider id `kimi`.

## Auth

```bash
export MOONSHOT_API_KEY=sk-...
# fallback
export KIMI_API_KEY=sk-...
```

Or pass `Authorization: Bearer <key>` on requests.

## Region

In `~/.trestle/config.json`:

```json
{
  "providers": {
    "kimi": { "region": "international" }
  }
}
```

- `international` (default): `https://api.moonshot.ai/v1`
- `china`: `https://api.moonshot.cn/v1`

Override with `providers.kimi.baseUrl` if needed.

## Models

Use slash notation:

```
kimi/kimi-k2.6
kimi/kimi-k2-thinking-turbo
```

The proxy strips the `kimi/` prefix before forwarding to Moonshot.

## Proxy routes

| Route | Upstream |
|-------|----------|
| `GET /v1/providers/kimi/ping` | models probe |
| `GET /v1/providers/kimi/balance` | `GET /users/me/balance` |
| `GET /v1/providers/kimi/models` | `GET /models` |
| `POST /v1/providers/kimi/tokenizers/estimate-token-count` | token estimate |
| `POST /v1/providers/kimi/files` | file upload (multipart passthrough) |
| `GET /v1/providers/kimi/files` | list files |
| `GET /v1/providers/kimi/files/:id` | file metadata |
| `DELETE /v1/providers/kimi/files/:id` | delete file |
| `GET /v1/providers/kimi/files/:id/content` | download content |

## Chat

Standard OpenAI client pointed at the proxy:

```bash
export OPENAI_BASE_URL=http://localhost:4100/v1
export OPENAI_API_KEY=$MOONSHOT_API_KEY
```

```json
{ "model": "kimi/kimi-k2.6", "messages": [...] }
```

## References

- [Moonshot platform](https://platform.moonshot.ai)
- [API overview](https://platform.moonshot.ai/docs/api/overview)
