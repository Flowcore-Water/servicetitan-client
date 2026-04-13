Read README.md for usage docs.

This is the shared ServiceTitan API client used by fleet-api, wellscope-api, request-parts-for-truck, and ops-console. Changes here affect all 4 consumers.

## Key constraints

- Zero runtime dependencies — uses native fetch
- Requires Node 18+ for AbortSignal.timeout
- {tenantId} in paths is auto-resolved from config
- Token cache is in-memory, not shared across processes
- Published to GitHub npm registry as `@flowcore-water/servicetitan-client`
- Consumer repos should install via the registry, not git clone
