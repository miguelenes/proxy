# Trestle Brand Guide

**Legal name:** Trestle Proxy  
**Tagline:** Built locally, measured honestly.

## Voice & tone

- Calm, engineering-literate, privacy-forward
- State facts; avoid hype or SaaS marketing
- Prefer "local" and "honest" over "smart" or "AI-powered"

**CLI examples:**
- `[Trestle] Proxy listening on http://127.0.0.1:4100`
- `[Trestle] Migrated data from ~/.trestle/ to ~/.trestle/`
- `Cloud features are not available in Trestle — local-only mode.`

**Dashboard footer:** Built locally, measured honestly. Request content stays on your machine.

## Color palette

| Token | Hex | Use |
|-------|-----|-----|
| Primary (copper) | `#c87941` | Accents, links, primary metrics |
| Background | `#0c1017` | Page background |
| Surface | `#141a24` | Cards, panels |
| Border | `#243044` | Dividers, card borders |
| Text | `#e8edf4` | Primary text |
| Text muted | `#7a8ba3` | Labels, secondary |
| Success | `#4ade80` | Healthy status |
| Warning | `#fbbf24` | Degraded / rate limits |
| Error | `#f87171` | Failures |

## Typography

- **UI:** Inter (Google Fonts)
- **Data / tables:** JetBrains Mono

## Logo

Assets in `assets/brand/`:

- `favicon.svg` — 32×32 truss mark
- `mark.svg` — square app icon
- `wordmark.svg` — mark + "Trestle" horizontal lockup

Abstract trestle/truss: horizontal beam with two supports. Minimum clear space: height of beam on all sides.

## Product identifiers

| Property | Value |
|----------|-------|
| CLI | `trestle` · `trestle-proxy` |
| npm | `@trestle/proxy` |
| Config | `~/.trestle/` |
| Env prefix | `TRESTLE_` |
| Model aliases | `trestle:*` · `tr:*` |
| HTTP headers | `x-trestle-*` |

## Legacy compatibility (one release)

| Legacy | Canonical |
|--------|-----------|
| `~/.trestle/` | `~/.trestle/` (auto-migrate) |
| `relayplane:*` / `rp:*` | `trestle:*` / `tr:*` |
| `RELAYPLANE_*` env | `TRESTLE_*` (warn once) |
| `x-relayplane-*` | `x-trestle-*` (mirrored when `TRESTLE_LEGACY_HEADERS=1`, default on) |

Set `TRESTLE_LEGACY_HEADERS=0` to stop mirroring deprecated response headers.
