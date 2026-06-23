# Devin v3 provider

Dedicated Devin v3 integration in `src/providers/devin.ts` with a chat-completion session adapter and full organization-scoped REST proxy routes.

## Configuration

| Setting | Value |
|---------|-------|
| API key env | `DEVIN_API_KEY` (`cog_`-prefixed service-user key; legacy `apk_` keys may fail on v3) |
| Org ID env | `DEVIN_ORG_ID` |
| Base URL | `https://api.devin.ai/v3` |
| Auth | `Authorization: Bearer ${DEVIN_API_KEY}` |
| Org override | `X-Devin-Org-Id` request header (takes precedence over env) |

Override base URL and org via `providers.devin` in `~/.trestle/config.json`:

```json
{
  "providers": {
    "devin": {
      "baseUrl": "https://api.devin.ai/v3",
      "orgId": "your-org-id",
      "createAsUserId": "optional-user-id"
    }
  }
}
```

## Two integration layers

### Chat completion adapter

Routes the `devin` provider through session create + poll for OpenAI-compat clients (`POST /v1/chat/completions`).

```json
{ "model": "devin/session", "messages": [{ "role": "user", "content": "Fix auth.ts" }] }
```

Optional `createAsUserId` in config forwards `create_as_user_id` on session create (requires `ImpersonateOrgSessions` permission).

### Direct v3 proxy

Full CRUD via `/v1/providers/devin/*`. Bearer token from request or `DEVIN_API_KEY` env fallback.

## Cursor pagination

List endpoints use cursor-based pagination. Pass query params unchanged:

- `first` — page size
- `after` — cursor from previous `end_cursor`

Response shape:

```json
{
  "items": [],
  "has_next_page": false,
  "end_cursor": null,
  "total": 0
}
```

## Proxy route map

| Proxy route | Method | Upstream |
|-------------|--------|----------|
| `/v1/providers/devin/self` | GET | `/self` |
| `/v1/providers/devin/sessions` | GET, POST | `/organizations/{org}/sessions` |
| `/v1/providers/devin/sessions/:id` | GET, DELETE | session get / terminate |
| `/v1/providers/devin/sessions/:id/messages` | GET, POST | session messages |
| `/v1/providers/devin/sessions/:id/archive` | POST | archive session |
| `/v1/providers/devin/sessions/:id/tags` | GET, POST, PUT | session tags |
| `/v1/providers/devin/pr-reviews` | GET, POST | PR reviews |
| `/v1/providers/devin/knowledge/notes` | GET, POST | knowledge notes |
| `/v1/providers/devin/knowledge/notes/:id` | GET, PUT, DELETE | note CRUD |
| `/v1/providers/devin/knowledge/folders` | GET | folder tree |
| `/v1/providers/devin/playbooks` | GET, POST | playbooks |
| `/v1/providers/devin/playbooks/:id` | GET, PUT, DELETE | playbook CRUD |
| `/v1/providers/devin/secrets` | GET, POST | secrets |
| `/v1/providers/devin/secrets/:id` | DELETE | delete secret |
| `/v1/providers/devin/repositories` | GET | available repos |
| `/v1/providers/devin/repositories/indexed` | GET | indexed repos |
| `/v1/providers/devin/repositories/index` | PUT, DELETE | bulk index / remove |
| `/v1/providers/devin/repositories/status` | GET | indexing status |
| `/v1/providers/devin/schedules` | GET, POST | schedules |
| `/v1/providers/devin/schedules/:id` | GET, PATCH, DELETE | schedule CRUD |
| `/v1/providers/devin/metrics/usage` | GET | org usage metrics |
| `/v1/providers/devin/metrics/sessions` | GET | session metrics |
| `/v1/providers/devin/metrics/prs` | GET | PR metrics |
| `/v1/providers/devin/metrics/searches` | GET | search metrics |
| `/v1/providers/devin/metrics/active-users` | GET | active users (custom range) |
| `/v1/providers/devin/metrics/dau` | GET | daily active users |
| `/v1/providers/devin/metrics/wau` | GET | weekly active users |
| `/v1/providers/devin/metrics/mau` | GET | monthly active users |
| `/v1/providers/devin/consumption/daily` | GET | org daily ACU |
| `/v1/providers/devin/consumption/daily/users/:userId` | GET | per-user daily |
| `/v1/providers/devin/consumption/daily/sessions/:sessionId` | GET | per-session daily |
| `/v1/providers/devin/consumption/daily/service-users/:suId` | GET | per-service-user daily |

## Permissions

Common service-user permissions required by endpoint group:

| Permission | Endpoints |
|------------|-----------|
| `ManageOrgSessions` | Sessions, messages, archive, tags |
| `ImpersonateOrgSessions` | `create_as_user_id` on session create |
| `ManageOrgSecrets` | Secrets CRUD |
| `ViewAccountMetrics` | Metrics and consumption endpoints |

See [Devin RBAC docs](https://docs.devin.ai/api-reference/overview) for the full permission matrix.

## Error codes

| Status | Hint |
|--------|------|
| 401 | Verify `DEVIN_API_KEY` (`cog_` prefix for v3) |
| 403 | Service user lacks permission — check role in Settings > Service Users |
| 404 | Resource not found or out of scope |
| 422 | Validation error — check request body |
| 429 | Rate limited — back off and retry |
| 500/503 | Server error — retry after a brief wait |

## Notes

- Enterprise `/v3/enterprise/*` endpoints are not proxied in this module.
- Devin v3 is REST/JSON only — no streaming. Long-running work uses async session create + poll (chat adapter).
- Official docs: [Devin API reference](https://docs.devin.ai/api-reference/overview)
