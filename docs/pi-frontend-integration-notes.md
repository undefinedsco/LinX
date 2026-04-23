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

## Next implementation target

Build a minimal **Pi Agent stream adapter** that can:

- start a Codex thread/turn
- emit assistant deltas into Pi's message/event model
- surface approval/tool events in a shape Pi can consume
- finalize the turn and session

Only after that should `InteractiveMode` be instantiated on top.
