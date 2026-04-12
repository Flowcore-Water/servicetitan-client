# @flowcore-water/servicetitan-client

Shared TypeScript client for the ServiceTitan API with OAuth token management, exponential backoff retry, and automatic pagination.

## Installation

```bash
# In package.json dependencies:
"@flowcore-water/servicetitan-client": "github:Flowcore-Water/servicetitan-client"
```

## Quick start

```typescript
import { ServiceTitanClient } from '@flowcore-water/servicetitan-client';

const st = new ServiceTitanClient();  // reads config from env vars

// Single request
const truck = await st.get<Truck>("inventory/v2/tenant/{tenantId}/trucks/123");

// Auto-paginate
const allTrucks = await st.paginateAll<Truck>("inventory/v2/tenant/{tenantId}/trucks");

// Delta sync
const updated = await st.fetchModifiedSince<Job>(
  "jpm/v2/tenant/{tenantId}/jobs",
  "2024-01-01T00:00:00Z"
);

// Write
const project = await st.post<Project>("jpm/v2/tenant/{tenantId}/projects", { name: "Test" });
await st.patch("jpm/v2/tenant/{tenantId}/projects/456", { status: "Active" });
```

## Features

- **OAuth2 client-credentials** with automatic token refresh (30s buffer before expiry)
- **Exponential backoff retry** on 429, 502, 503, 504 and network errors (up to 4 retries)
- **Auto-pagination** via `paginateAll()` and `fetchModifiedSince()`
- **`{tenantId}` placeholder** automatically resolved in paths
- **Zero dependencies** — uses native `fetch` and `AbortSignal.timeout`

## Required environment variables

| Variable | Description |
|----------|-------------|
| `SERVICETITAN_CLIENT_ID` | OAuth client ID |
| `SERVICETITAN_CLIENT_SECRET` | OAuth client secret |
| `SERVICETITAN_TENANT_ID` | ST tenant ID |
| `SERVICETITAN_APP_KEY` | ST application key |

## Optional environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICETITAN_API_URL` | `https://api.servicetitan.io` | API base URL |
| `SERVICETITAN_AUTH_URL` | `https://auth.servicetitan.io/connect/token` | Token endpoint |

## API

### Constructor

```typescript
new ServiceTitanClient(config?: ServiceTitanClientConfig)
```

All config fields are optional — defaults to env vars.

### Methods

| Method | Description |
|--------|-------------|
| `get<T>(path, params?)` | GET request |
| `post<T>(path, body?)` | POST request |
| `patch<T>(path, body?)` | PATCH request |
| `delete<T>(path)` | DELETE request |
| `getPage<T>(path, page?, pageSize?, params?)` | Single page of paginated results |
| `paginateAll<T>(path, pageSize?, params?)` | All pages as flat array |
| `fetchModifiedSince<T>(path, since?, pageSize?, deltaParam?)` | Delta sync pagination |
| `tenantPath(path)` | Resolve `{tenantId}` in path |
| `resetTokenCache()` | Clear cached token (for tests) |

### Error handling

Non-retryable errors (400, 401, 403, 404) throw `ServiceTitanError` immediately.
Retryable errors (429, 502, 503, 504) are retried with exponential backoff.

```typescript
import { ServiceTitanError } from '@flowcore-water/servicetitan-client';

try {
  await st.get("...");
} catch (err) {
  if (err instanceof ServiceTitanError) {
    console.error(err.statusCode, err.message);
  }
}
```
