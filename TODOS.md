# TODOS

## Review

### Add a migration assistant from localhost-only Local to remote-ready Local

**What:** Add an explicit migration flow that upgrades a `This device only` Local setup into a remote-ready Local setup with a stable public base URL.

**Why:** The Phase 2 onboarding deliberately asks users to choose their identity anchor up front, so users who start with localhost-only mode still need a safe, supported way to expand to multi-device access later.

**Context:** The current reviewed plan avoids silently changing canonical identity URLs after first-run. That keeps first-run honest, but it also means future remote access cannot be treated as a simple settings toggle. This work should define the migration semantics for `baseUrl`, `WebID`, `podRoot`, diagnostics, and user messaging, and should start only after `linx-local-onboarding/v1`, mode choice, resume state, and repair flows are in place.

**Effort:** L
**Priority:** P2
**Depends on:** `linx-local-onboarding/v1`, Local mode choice UI, desktop resume store, Local diagnostics/repair flow
