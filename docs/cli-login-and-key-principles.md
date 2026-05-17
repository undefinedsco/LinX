# CLI Login And Key Principles

This document fixes the CLI-only boundary for LinX Cloud login, provider API key
entry, Pod storage, and backend runtime consumption.

## Principle

The CLI interaction should extend the existing Pi CLI/TUI login mental model.

- LinX/Solid access uses the existing browser OIDC consent flow.
- If browser callback cannot return to the terminal, the CLI may ask the user to
  paste the final redirect URL.
- If a backend provider key is missing, the CLI may ask the user to paste/type
  that key in the current CLI/TUI flow.
- After provider-key entry, the CLI writes the key into Pod AI config through
  shared model paths.
- Backend runtime startup then retries by reading the key from Pod. Runtime code
  does not keep a separate durable local provider-key source.

The user-facing interaction stays Pi-like. The durable storage changes: provider
keys go to the user's Pod instead of staying only in a local runtime auth store.

## CLI Login

CLI login means LinX/Solid login.

Expected behavior:

1. `linx login` opens browser OIDC consent.
2. The callback is captured by the local CLI callback server.
3. If the callback cannot complete, the CLI can ask for manual redirect paste.
4. The CLI stores only LinX/Solid auth material needed to regain Pod access.
5. The CLI does not store provider API keys as part of LinX/Solid login.

This login gives the CLI authority to read/write the user's Pod data. It is not
the same thing as an OpenAI/Anthropic/CodeBuddy key.

## CLI Provider Key Handling

Provider keys are backend credentials, not LinX login credentials.

Expected behavior:

1. CLI restores LinX/Solid access.
2. CLI reads active provider credentials from Pod AI config.
3. If the needed provider key is missing, CLI asks for the key in the current
   command/TUI context.
4. CLI writes the key via shared AI config resources:
   `credentialResource`, `aiProviderResource`, `aiModelResource`.
5. CLI retries runtime startup from Pod-backed credential resolution.

This is intentionally one flow from the user's point of view: authenticate to
Pod when needed, enter provider key when needed, then continue the original CLI
task.

## Runtime Consumption

`linx --backend <backend>` consumes credentials non-interactively once they
exist in Pod.

- `claude` / Anthropic maps to `ANTHROPIC_API_KEY`.
- `codex` / OpenAI maps to Codex-owned `CODEX_API_KEY`.
- `codebuddy` maps to `CODEBUDDY_API_KEY`.
- Provider base URL, when present in Pod AI config, maps to the backend-specific
  base URL environment/config.

The runner must not write full provider keys into archives, messages, audits,
logs, generated docs, or TUI state.

## Non-Goals

- No user-facing `credential-source` selector.
- No durable local provider-key fallback for CLI backends.
- No second provider alias table in CLI code.
- No hand-written Turtle parser/writer for AI credentials.
- No App/GUI product rule is defined by this page; this page is CLI-only.

## Review Checklist

- Missing LinX/Solid login routes to browser OIDC or manual redirect paste.
- Missing provider credential routes to CLI/TUI key entry when the current
  command can safely collect it.
- Provider-key entry writes Pod AI config through shared model paths.
- Backend startup retries from Pod-backed credential resolution.
- Existing-Pod-key and missing-key-acquire-then-retry paths both have tests.
