# Cursor team API provider

Dedicated Cursor Admin, Analytics, and AI Code Tracking integration in `src/providers/cursor.ts`, exposed as `/v1/providers/cursor/*` proxy routes.

This is **not** a chat-completion provider. For routing Cursor IDE LLM traffic through Trestle, see [docs/integrations/cursor-agent.md](../integrations/cursor-agent.md).

Cloud Agents API and `@cursor/sdk` are **out of scope** — this module covers team admin/analytics REST only.

## Configuration

| Setting | Value |
|---------|-------|
| API key env | `CURSOR_API_KEY` (`crsr_` admin-scoped key, `admin:*` scope) |
| Base URL | `https://api.cursor.com` |
| Upstream auth | Basic — key as username, empty password |

Create keys: Cursor Dashboard → Settings → Advanced → Admin API Keys.

Override in `~/.trestle/config.json`:

```json
{
  "providers": {
    "cursor": {
      "baseUrl": "https://api.cursor.com",
      "apiKeyEnv": "CURSOR_API_KEY"
    }
  }
}
```

## Proxy auth

The proxy accepts:

1. `Authorization: Basic …` (decoded key)
2. `Authorization: Bearer …` (converted to Basic upstream)
3. `CURSOR_API_KEY` env fallback

## Allowlisted paths

Only these upstream prefixes are forwarded:

- `/teams/*` — Admin API
- `/settings/*` — repo blocklists
- `/analytics/*` — Analytics + AI Code Tracking

Cloud Agents (`/v1/*`) is blocked at the proxy.

## ETag caching

For Analytics and Code Tracking GET endpoints, pass `If-None-Match` from a prior `ETag` response. Upstream `304 Not Modified` is passed through (does not count against rate limits per Cursor docs).

## Rate limits

| API | Limit |
|-----|-------|
| Admin (most endpoints) | 20 req/min |
| Admin `/teams/user-spend-limit` | 250 req/min |
| Analytics (team-level) | 100 req/min |
| Analytics by-user | 50 req/min |
| AI Code Tracking | 20 req/min per endpoint |

Backoff on `429`.

## Proxy route map

Paths mirror upstream under `/v1/providers/cursor`:

### Admin — `/teams/*`

| Proxy route | Method | Upstream |
|-------------|--------|----------|
| `/v1/providers/cursor/teams/members` | GET | List team members |
| `/v1/providers/cursor/teams/audit-logs` | GET | Audit logs |
| `/v1/providers/cursor/teams/daily-usage-data` | POST | Daily usage |
| `/v1/providers/cursor/teams/spend` | POST | Spending data |
| `/v1/providers/cursor/teams/filtered-usage-events` | POST | Usage events |
| `/v1/providers/cursor/teams/user-spend-limit` | POST | Set spend limit |
| `/v1/providers/cursor/teams/remove-member` | POST | Remove member |
| `/v1/providers/cursor/teams/groups` | GET, POST | List/create groups |
| `/v1/providers/cursor/teams/groups/:id` | GET, PATCH, DELETE | Group CRUD |
| `/v1/providers/cursor/teams/groups/:id/members` | POST, DELETE | Group membership |

### Admin — `/settings/*`

| Proxy route | Method |
|-------------|--------|
| `/v1/providers/cursor/settings/repo-blocklists/repos` | GET |
| `/v1/providers/cursor/settings/repo-blocklists/repos/upsert` | POST |
| `/v1/providers/cursor/settings/repo-blocklists/repos/:id` | DELETE |

### Analytics — `/analytics/team/*`

`agent-edits`, `tabs`, `dau`, `client-versions`, `models`, `top-file-extensions`, `mcp`, `commands`, `plans`, `skills`, `ask-mode`, `conversation-insights`, `leaderboard`, `bugbot` — all GET with query passthrough (`startDate`, `endDate`, `users`, date shortcuts `7d`/`30d`).

### Analytics — `/analytics/by-user/*`

Same metrics as team-level, per-user with pagination (`page`, `pageSize`, `users`).

### AI Code Tracking — `/analytics/ai-code/*` (Enterprise, alpha)

| Proxy route | Method | Notes |
|-------------|--------|-------|
| `/v1/providers/cursor/analytics/ai-code/commits` | GET | JSON, paginated |
| `/v1/providers/cursor/analytics/ai-code/commits.csv` | GET | CSV stream |
| `/v1/providers/cursor/analytics/ai-code/changes` | GET | JSON, paginated |
| `/v1/providers/cursor/analytics/ai-code/changes.csv` | GET | CSV stream |
| `/v1/providers/cursor/analytics/ai-code/commits/:hash` | GET | Commit details + blame |

## Example

```bash
export CURSOR_API_KEY="crsr_..."

# Team members
curl -H "Authorization: Bearer $CURSOR_API_KEY" \
  http://localhost:4100/v1/providers/cursor/teams/members

# DAU (last 7 days default)
curl "http://localhost:4100/v1/providers/cursor/analytics/team/dau?startDate=30d" \
  -H "Authorization: Bearer $CURSOR_API_KEY"

# AI code commits CSV
curl -L "http://localhost:4100/v1/providers/cursor/analytics/ai-code/commits.csv?startDate=7d" \
  -H "Authorization: Bearer $CURSOR_API_KEY" \
  -o commits.csv
```

## Error codes

| Status | Hint |
|--------|------|
| 401 | Invalid/missing `CURSOR_API_KEY` |
| 403 | Enterprise access required |
| 429 | Rate limited — backoff |
| 500 | Server error — retry |

## Official docs

- [API overview](https://cursor.com/docs/api)
- [Admin API](https://cursor.com/docs/account/teams/admin-api)
- [Analytics API](https://cursor.com/docs/account/teams/analytics-api)
- [AI Code Tracking API](https://cursor.com/docs/account/teams/ai-code-tracking-api)
