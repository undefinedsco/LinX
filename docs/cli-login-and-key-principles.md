# CLI Login And Key Principles

This document fixes the CLI-only boundary for LinX Cloud identity login, AI
provider credential entry, Pod storage, and backend runtime consumption.

## Principle

The CLI interaction should extend the existing Pi CLI/TUI login mental model.

- LinX/xPod/Solid access uses the existing browser OIDC consent flow.
- Login acquisition and runtime consumption are separate boundaries: the login
  module is responsible for browser/redirect/manual-paste acquisition and
  session refresh, while CLI/backend runtime code only consumes the resulting
  usable session.
- If browser callback cannot return to the terminal, the CLI may ask the user to
  paste the final redirect URL.
- If an AI provider credential is missing, the CLI may ask the user to run
  `linx ai connect <provider>` or use the equivalent credential repair flow.
- After provider-credential entry, the CLI writes the key into Pod AI config
  through shared model paths.
- Backend runtime startup then retries by reading the key from Pod. Runtime code
  does not keep a separate durable local provider-key source.

The user-facing interaction stays Pi-like. The durable storage changes: provider
keys go to the user's Pod instead of staying only in a local runtime auth store.

## CLI Login

CLI login means LinX/xPod/Solid login.

A successful login produces a reusable LinX/Solid session. After that boundary,
the CLI/backend must read the session and use it for Pod access; it must not
re-open browser login or duplicate login-state handling inside the runtime path.

Expected behavior:

1. `linx login` opens browser OIDC consent.
2. The callback is captured by the local CLI callback server.
3. If the callback cannot complete, the CLI can ask for manual redirect paste.
4. The CLI stores only LinX/Solid auth material needed to regain Pod access.
5. The CLI does not store AI provider API keys as part of LinX/xPod/Solid login.

This login gives the CLI authority to read/write the user's Pod data. It is not
the same thing as an AI provider credential.

## CLI Provider Key Handling

Provider keys and provider base URLs are backend credentials, not LinX/xPod
login credentials.

Expected behavior:

1. CLI restores LinX/Solid access.
2. CLI reads active provider credentials from Pod AI config.
3. If the needed provider credential is missing, CLI keeps the current LinX
   command/TUI session active. AI Secretary explains the `missing` backend
   config in the chat surface, then collects `provider_id`, `api_key`, and
   `base_url` through the TUI credential input flow or by routing to
   `linx ai connect <provider>`.
4. If a provider credential exists but is rejected or otherwise known bad, AI
   Secretary uses the same repair flow but labels it as `invalid`, not
   `missing`.
5. CLI writes provider config and keys via shared AI config resources:
   `credentialResource`, `aiProviderResource`, `aiModelResource`.
6. CLI retries runtime startup from Pod-backed credential resolution.

This is intentionally one flow from the user's point of view: authenticate to
Pod when needed, connect an AI provider when needed, then continue the original
CLI task.

## Runtime Consumption

`linx --backend <backend>` consumes credentials non-interactively once they
exist in Pod.

The runtime consumes a usable Pod/session boundary, not the login ceremony
itself. Browser OIDC, client credentials, and manual redirect recovery belong
to the login flow; once a session exists, backend startup and chat/model calls
only read that session and the Pod-backed provider config.

- `claude` / Anthropic maps to `ANTHROPIC_API_KEY`.
- `codex` maps any Codex-compatible Pod provider credential to Codex-owned
  `CODEX_API_KEY`. A provider can be OpenAI, DeepSeek, OpenRouter, a LiteLLM
  gateway, or another custom provider marked with `supportsBackend=codex`.
- `codebuddy` maps to `CODEBUDDY_API_KEY`.
- Provider `baseUrl` normally lives on `aiProviderResource`; credential-level
  `baseUrl` is only an override. The selected base URL maps to the
  backend-specific base URL environment/config.

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
- Provider credential entry writes provider id, `api_key`, and `base_url` to
  Pod AI config through shared model paths.
- User-visible copy and persisted repair events distinguish `missing` from
  `invalid` credentials.
- Backend startup retries from Pod-backed credential resolution.
- Existing-Pod-key and missing-key-acquire-then-retry paths both have tests.
