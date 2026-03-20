# LinX Delivery Plan

## Frozen Boundaries

- `xpod` manages **Solid credentials only**.
- `LinX` consumes Solid session/access capability from `xpod` or the client session layer.
- AI provider keys and other business secrets are **out of scope** for this track.

## Phase 1 — Minimal Multi-Environment Shell

Goal: compile a minimal `LinX` shell for `web`, `desktop`, and `mobile`, using **Solid Pod login only**.

Scope:
- Shared web UI shell
- Desktop = Electron wrapper around web shell
- Mobile = Capacitor wrapper around web shell
- Login path only uses Solid Pod / Solid OIDC
- No agent runtime yet
- No inbox/audit center yet

Completion criteria:
- `apps/web` builds successfully
- `apps/desktop` continues to host the web shell
- `apps/mobile` points to the web build output
- Login UI clearly communicates Pod-login-only scope

## Phase 2 — Chat With Pod Archive

Goal: implement minimal chat with Pod as the record system.

Scope:
- `chat / thread / message`
- Send and display messages
- Persist all chat records to Pod
- No runtime agent orchestration yet

Completion criteria:
- Create chat
- Create thread
- Send/receive messages
- Pod retains message history

## Phase 3 — Runtime Agent (Internal First)

Goal: add runtime-backed agent sessions for internal use before productizing authorization.

Scope:
- Runtime session creation
- Worktree/workspace association
- Remote chat against runtime
- Basic local audit trail for internal use

Completion criteria:
- Create runtime session
- Associate workspace/worktree
- Continue/resume runtime-backed session
- Internal audit information available

## Phase 4 — Inbox-Centered Audit & Authorization

Goal: converge approvals and audit into a unified inbox model.

Scope:
- Central inbox for approvals
- Unified audit timeline
- Consolidated authorization actions
- Remove scattered approval UX

Completion criteria:
- Authorization requests flow into inbox
- Audit timeline is queryable and visible
- Session/control approvals converge on one path
