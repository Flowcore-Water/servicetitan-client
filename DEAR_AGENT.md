# ServiceTitan Client — Agent Instructions

## What This Is

Shared TypeScript API client for ServiceTitan v2 REST API. Published as
`@flowcore-water/servicetitan-client` to the GitHub npm registry. Zero
runtime dependencies — uses native `fetch`.

## Consumer Repos

This package is used by:
- fleet-api
- wellscope-api
- request-parts-for-truck
- ops-console

Changes here ripple to all four. Test carefully.

## Architecture

- `src/client.ts` — main implementation: OAuth2 token management,
  exponential backoff retry, auto-pagination, tenant-scoped requests
- `src/index.ts` — public exports
- In-memory token cache (not shared across processes)
- `{tenantId}` in URL paths is auto-resolved from config

## Key Constraints

- Requires Node 18+ (uses `AbortSignal.timeout`)
- Zero runtime dependencies — do not add axios, got, etc.
- Token refresh is automatic and transparent to callers
- Retry logic uses exponential backoff with jitter
- All methods return typed responses matching ST API contracts

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ST_CLIENT_ID` | Yes | ServiceTitan OAuth app client ID |
| `ST_CLIENT_SECRET` | Yes | ServiceTitan OAuth app client secret |
| `ST_TENANT_ID` | Yes | ServiceTitan tenant ID |
| `ST_APP_KEY` | Yes | ServiceTitan application key |

## Publishing

- Push to `main` triggers `publish.yml` which publishes to GitHub npm registry
- Version bump in `package.json` before merging to main
- Consumers pin to specific versions via package.json

## What NOT to Do

- Don't add runtime dependencies
- Don't break the public API surface without updating all 4 consumer repos
- Don't hardcode tenant IDs or credentials
- Don't cache tokens to disk (security risk in shared environments)
