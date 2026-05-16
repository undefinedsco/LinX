# Pi Frontend Integration Notes

Date: 2026-04-17

## Key conclusion

Integrating the `pi` frontend is **not** primarily a `pi-tui` problem.

The `@mariozechner/pi-coding-agent` interactive frontend (`InteractiveMode`) is tightly coupled to:

- `AgentSessionRuntime`
- `AgentSession`
- `SessionManager`
- `SettingsManager`
- `ModelRegistry`
- `ResourceLoader`

So the correct integration cut is **not**:

```text
LinX data channel -> pi-tui
```

It is:

```text
LinX Codex/Pod data channel -> custom Agent/stream adapter -> AgentSession / AgentSessionRuntime -> Pi InteractiveMode
```

## Why this matters

The default `createAgentSession()` path in `pi-coding-agent` constructs an `Agent` that uses:

- `streamSimple(model, context, ...)`

with auth and model resolution driven by Pi's own:

- `AuthStorage`
- `ModelRegistry`

That means "backend = Codex + Pod" cannot be achieved just by creating a fake runtime wrapper around the existing Pi session objects.

Instead, a real integration will need one of:

1. a custom `Agent` compatible stream adapter whose `streamFn` is backed by Codex/App-Server data
2. or a fork/patch layer inside `pi-coding-agent` that allows replacing the `Agent` event source cleanly

## Current LinX assets already available

- child-first Codex app-server proxy
- approval bridge to Pod/xpod control plane
- archive logging
- transcript normalization for Codex app-server samples
- Pod persistence on session exit

These should be reused as the backend/data plane.

## Updated baseline after truth-surface audit

The current repo state is now clearer:

- `chat` / `thread` / `message` already have real Pod tables and active writers
- `approval` / `audit` / `inbox` already have real Pod tables and active writers in auto-mode/runtime-sidecar paths
- `grant` exists as the durable delegation/authz layer; auto-mode remote approval now writes and consumes active grants, while Pi/web coverage is still incomplete
- `session` had been only a stub contract; it now has a real shared `sessionResource` baseline in `@undefineds.co/models`, exposed through neutral `solidSchema`, with runtime-sidecar write/read baseline in place

This means the next implementation target is **not** “just make Pi talk to a stream adapter”.
The next correct target is:

1. truth-source audit / ownership matrix
2. session-domain writer/reader implementation
3. approval vs authorization mapping
4. only then transport normalization

## Immediate next implementation target

Use the new session table + truth-surface matrix as the execution baseline:

- wire a durable session writer/reader
- keep UI-only state local
- keep Pod as truth for the in-scope runtime/business surfaces
- document any remaining transport limitations explicitly until the richer runtime path is implemented


## Product-branded storage naming

Shared storage contracts should use Solid/domain language. The old `linxSchema` product-branded export has been removed instead of kept as a compatibility alias. New Pi/Pod/cloud alignment code should import `solidSchema`, and docs should describe durable records as Solid resources / schemas instead of product-level tables.
