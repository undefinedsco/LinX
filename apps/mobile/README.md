# LinX Mobile

Phase 1 mobile shell uses Capacitor to wrap the shared `apps/web` build output.

## Current Scope

- Shared web UI
- Solid Pod login only
- No dedicated mobile-native business logic yet

## Development

```bash
# Build the shared web shell for mobile
yarn workspace @linx/mobile build:web

# Sync Capacitor assets
yarn workspace @linx/mobile sync
```
