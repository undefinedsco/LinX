# Backend / Pod Contract

This document records the non-negotiable contract for LinX running external
agent backends such as Codex, Claude Code, and CodeBuddy.

The goal is simple: backend selection changes the worker runtime, not LinX's
data ownership, auth ownership, or persistence semantics.

## Design Principles

These principles are the review baseline for auto-mode work:

- Backend selection is a runtime adapter choice, not a product fork. Choosing
  Codex, Claude Code, CodeBuddy, Pi, or a future ACP backend must only change
  the external worker command/protocol.
- Pod remains the durable source of truth. Credentials, provider config,
  model config, chats, threads, sessions, messages, approvals, grants, audits,
  and inbox notifications must converge to shared Pod resources.
- Local runtime is allowed to be ahead of Pod. Local archive/cache writes are
  the availability path; Pod sync is the durability/convergence path.
- Auth acquisition can differ, but post-auth data access cannot. OIDC browser
  auth, client credentials, and native backend auth may produce sessions or
  injected environment differently; after that boundary, credential lookup,
  event normalization, approval handling, archive, and Pod sync must use the
  same shared path.
- ACP/ChatKit/Pi integration code is protocol adaptation only. It may map
  runtime events into shared DTOs and render TUI/App controls, but it must not
  define shared business predicates, subject templates, provider aliases, or a
  second approval policy.

### Review Invariants

Use these invariants when reviewing an auto-mode design or implementation:

- One product surface, multiple backend runtimes. `linx --backend codex` and
  `linx --backend claude` are different worker adapters for the same LinX
  product state, not separate products with separate persistence semantics.
- Backend command language stays native. After a backend is selected, commands,
  flags, approval prompts, and runtime behavior should follow that backend's
  native protocol as far as possible; LinX wraps and records the interaction
  without inventing a second command language.
- The shell is not the domain layer. CLI/TUI and App/GUI may differ in
  rendering and interaction, but they must call the same shared models,
  repositories, runtime contracts, and approval semantics.
- Authentication paths are interchangeable inputs to the same data path. OIDC,
  client credentials, and backend-native login may differ before a usable
  session or environment exists; they must not fork credential lookup, archive
  shape, Pod writes, approval handling, or sync semantics after that boundary.
- The local archive is a cache plus recovery log, not a competing source of
  truth. It may unblock work while Pod is unavailable, but any state with
  cross-surface meaning must be syncable to Pod.
- Exact resource identity beats scanning. When LinX already has a resource URI,
  it should do exact lookup/update/delete. Bounded listing is reserved for
  discovery surfaces such as inbox views.
- Shared model gaps are fixed at the shared boundary. If CLI/App needs a query,
  mutation, URI resolver, or predicate that is not available, add it to
  `@undefineds.co/models` or `drizzle-solid` instead of hand-parsing Turtle or
  duplicating subject templates in a shell.
- Automation assists the user; it does not silently redefine authority. AI
  Secretary may judge existing grants, recommend allow/deny/input, and perform
  an allowed auto action after a visible reaction window. Grant creation remains
  a user-authored decision.

## Backend Selection

- `linx --backend codex` must run the Codex ACP backend command.
- `linx --backend claude` must run the Claude Code ACP backend command.
- `linx --backend codebuddy` must run the CodeBuddy ACP backend command.
- Backend-specific flags after `--` are passed to that backend unchanged.
- LinX may wrap the backend with TUI, approval, archive, sync, and controller
  behavior, but it must not replace the selected backend's command language or
  native runtime semantics.

`linx` without `--backend` remains the default LinX/Pi experience. External
agent control is selected only through `--backend` plus the relevant flags.

## Credential And Config Source

Backend provider credentials and provider-level config are Pod data.

- Provider API keys for Codex/OpenAI, Claude/Anthropic, CodeBuddy, and similar
  external app providers must be read from the user's Pod through the shared
  AI config model.
- In CLI flows, credential acquisition should reuse the current Pi-style
  interaction: browser OIDC for LinX/Solid access, and current CLI/TUI API-key
  entry when a provider key is missing. The durable difference is that the
  acquired provider key is written to Pod AI config, not kept as a local
  provider-key source.
- The local machine may keep only LinX/Solid auth material needed to obtain a
  Pod session, plus local cache/archive data.
- Backend API keys must not be copied into session archive, messages, audits,
  TUI state, logs, or generated docs.
- CLI/App shells must not introduce a second credential format, a second
  provider alias table, or a hand-written Turtle parser for shared credential
  data.
- Backend credential strategy is fixed: provider credentials are read from Pod
  AI config after LinX/Solid auth has produced an Inrupt-compatible session.
  There is no user-facing `credential-source` choice and no local provider key
  fallback.

Detailed CLI interaction rules are in `docs/cli-login-and-key-principles.md`.

The shared query path is:

```text
Solid auth -> Inrupt-compatible session -> drizzle-solid -> @undefineds.co/models
```

OIDC browser auth and client-credentials auth may produce that session
differently. After the session boundary, downstream credential/config lookup
must be the same.

## Local-First Persistence

Interactive backend work is local-first.

- The local runtime must be able to continue even when Pod sync is slow or
  temporarily failing.
- Local archive/cache writes happen first so the active terminal session is not
  blocked by network or Pod errors.
- Pod sync is then attempted through shared models/repositories.
- Pod sync failure should surface as a warning or retryable sync state, not as a
  reason to discard the local turn or block the backend from continuing.

Local-first does not mean local-only. Durable product state must converge to
Pod when connectivity and auth allow it.

## Pod-Backed Critical Data

All cross-surface durable data must be Pod-backed.

Required Pod-backed surfaces:

- `chat`
- `thread`
- `message`
- `session`
- `approval`
- `grant` / authorization
- `audit`
- `inbox_notification`
- AI provider config, model config, and active credentials

Pure UI state may remain local. Backend process state, cursor state, and
terminal rendering state may remain local when they have no cross-surface
meaning.

If a resource exists in `@undefineds.co/models`, CLI/App code must use the
shared resource/repository. Missing query ergonomics should be added to the
shared model layer first, not worked around by parsing TTL or duplicating URI
builders in a shell.

## Backend Auth Paths

Backend native auth paths must remain usable.

- Codex, Claude Code, CodeBuddy, and future ACP-compatible tools can still use
  their native login/session behavior when the selected credential source allows
  it.
- LinX cloud/Pod credentials are an additional managed credential source, not a
  reason to delete upstream auth compatibility.
- Auth preflight and auth-failure normalization should be shared model/runtime
  logic where possible so CLI and App do not diverge.
- Once auth produces a usable runtime session or injected environment, the rest
  of the backend flow must be identical: same event normalization, same local
  archive, same Pod sync, same approval path.

## Approval And Automation

Approval follows upstream runtime semantics.

- LinX must not invent a parallel approval policy based on CLI-local tool
  allowlists.
- When the backend emits an approval or structured input request, LinX may
  display it locally, mirror it to Pod, and let App/Inbox resolve it remotely.
- AI Secretary may recommend allow/deny/input. It must not recommend creating
  grants on its own; grant creation is a user decision.
- Existing grants are durable user-authored wiki resources in Pod. AI Secretary
  can evaluate whether a request is covered by an existing grant, but this
  judgement is semantic and must not be reduced to request fingerprint matching.

Detailed AI Secretary capability boundaries live in
`docs/secretary/capability-contract.md`. This document only fixes the backend /
Pod invariants that CLI/App implementations must preserve.

## Verification Standard

A change touching auto-mode, credentials, sync, approval, or auth is not
complete until it proves:

- Each supported `--backend` launches the expected backend command.
- Pod credential/config lookup works for each supported backend.
- Native backend auth paths remain reachable when configured.
- Local archive/cache still works without Pod write success.
- Pod sync can write/read the critical resources listed above through shared
  models.
- Approval and grant flows use exact resource lookup when the resource URI is
  known, and bounded listing only for inbox-style discovery.
