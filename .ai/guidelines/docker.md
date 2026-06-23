# Docker deployment

Run Trestle Proxy in a container with persistent config.

## Quick start

```bash
cp .env.example .env
# Edit .env with your API keys

docker compose up -d --build
```

Dashboard: http://localhost:4100

## Files

| File | Purpose |
|------|---------|
| [Dockerfile](../../Dockerfile) | Multi-stage build (native `better-sqlite3` compile) |
| [docker-compose.yml](../../docker-compose.yml) | Service, port 4100, env, volume |
| [.env.example](../../.env.example) | All supported API key env vars |

## Configuration

- Config persists in Docker volume `trestle-data` at `/root/.relayplane/`
- Override path: `TRESTLE_CONFIG_PATH=/root/.relayplane/config.json`
- Bind `0.0.0.0:4100` inside container (CLI default is 127.0.0.1)

## Host Ollama from container

`docker-compose.yml` includes `host.docker.internal` so the proxy can reach Ollama on the host:

```json
{
  "ollama": {
    "baseUrl": "http://host.docker.internal:11434"
  }
}
```

## GitHub Copilot SDK

The Copilot integration spawns the bundled Copilot CLI via `@github/copilot-sdk`. This is **not recommended inside the default Docker image** unless you add GitHub auth, Node `>=20.19`, and any CLI OS dependencies. Use Copilot on the host or in CI instead — see [docs/providers/copilot.md](../../docs/providers/copilot.md).

## Health check

```bash
curl http://localhost:4100/health
```

Compose runs the same check every 30s.

## Build only

```bash
docker build -t trestle-proxy .
docker run --rm -p 4100:4100 --env-file .env -v trestle-data:/root/.relayplane trestle-proxy
```
