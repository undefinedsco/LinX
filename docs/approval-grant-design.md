# Approval And Grant Design

This document is the feature contract for LinX approval and grant behavior
across CLI, App, AI Secretary, and backend runtimes.

## Terms

- `Approval`: one concrete runtime request that needs a decision now. It comes
  from a backend/runtime or extension prompt, then is mirrored to Pod.
- `Grant`: reusable user authorization stored in Pod. It is not the approval
  response itself.
- `allow_once`: resolves only the current approval. It never creates a grant.
- `allow_for_session`: creates a session-scoped grant.
- `allow_always`: creates a durable grant that may be reused across sessions.

There is no separate "semantic grant" mode. Every grant is a policy page with
an exact provenance anchor and a user-approved generalization boundary.

## Unified Pipeline

CLI and Web are both producer/consumer UIs for the same approval pipeline. They
do not own approval policy or grant matching.

The canonical flow is:

1. A runtime emits an approval or structured input request.
2. LinX writes the request to the shared `approval` / inbox control plane with
   the upstream options, request URI, expiry, runtime context, and provenance.
3. The unified approval pipeline checks active grants before asking the user or
   Secretary.
4. If an existing grant covers the request, the pipeline approves directly.
   This is independent of `auto`.
5. If no grant covers the request and `auto off`, the request waits for the
   user.
6. If no grant covers the request and `auto on`, Secretary may approve or
   decline once after the visible reaction window when it is safe. Otherwise it
   waits for the user.
7. If the user selects `allow_for_session` or `allow_always`, the pipeline
   materializes a grant with the corresponding scope.

The three approval outcomes are therefore:

- Direct pass: existing grant covers the request.
- Countdown pass: `auto on`, no grant, Secretary can safely decide once.
- Indefinite wait: no grant and no safe Secretary decision, or `auto off`.

## Grant Semantics

All grants must include an exact exemplar/provenance anchor and an explicit
generalization boundary.

Required provenance should include, when available:

- source approval URI;
- runtime/backend;
- tool or action name;
- target/resource/command;
- cwd/workspace/session/thread;
- risk level and original user-facing prompt/options.

Reusable policy should live in grant title, summary, body, tags, context, and
policy fields. `target`, `action`, and risk fields may be used for candidate
retrieval and ranking, but they are not sufficient by themselves to approve a
new request unless the exact request is deterministically the same approval.

Grant matching is pipeline-owned:

- Session-scoped grants only match the same session scope.
- Durable grants may match later sessions when the policy covers the request.
- Exact/provenance fields narrow the candidate set.
- Generalized coverage is evaluated against the grant policy/body and the
  current request context.
- If coverage is unclear, the pipeline falls back to visible approval.

## Secretary Boundary

Secretary can evaluate requests and existing grants, but it cannot create a
grant by itself.

In `auto on`, Secretary may choose only a one-time decision: approve, decline,
cancel, answer structured input, or wait for the user. It must not choose
`allow_for_session` or `allow_always` on behalf of the user.

Grant creation requires a user UI action. The user-facing options that create
grants are equivalent to user authoring:

- `allow_for_session`: user grants a reusable policy for the current session.
- `allow_always`: user grants a reusable durable policy.

## Backend Boundary

Backend-native approval policy remains a backend/runtime setting. LinX `auto`
does not replace it.

LinX only mirrors approvals that the backend or extension actually asks for. It
must not invent a separate approval request from CLI-local tool allowlists.

Pi extension UI prompts are interaction prompts. They preserve the selected
option for the extension, but they do not create reusable LinX grants unless
the prompt is explicitly routed through the shared approval pipeline with grant
options.

## Model Requirements

Shared approval/grant state belongs in `@undefineds.co/models`.

The model layer must expose enough shared fields for:

- approval URI exact lookup;
- upstream approval options;
- expiry / reaction-window metadata;
- grant scope: session or durable;
- exact source/provenance;
- reusable policy/body/context;
- audit trail from approval decision to materialized grant.

Shells may pass runtime opaque ids in metadata, but cross-surface facts used for
lookup, recovery, approval, audit, or grant matching must be shared model fields
or URI relations.

## Quality Inspection And Reporting

The approval path needs its own quality loop. The goal is not generic telemetry;
it is to know whether LinX approved the right things, waited for the user at the
right time, preserved backend semantics, and created reusable grants only when
the user explicitly intended that.

Quality inspection should measure the unified pipeline, not individual UI
surfaces. CLI and Web may display or resolve requests, but the quality facts
must attach to shared approval, grant, audit, session, and runtime records.

### Events To Report

Record append-only audit events for the important transitions:

- `approval.requested`: backend/runtime or extension produced a concrete
  approval or structured input request.
- `approval.grant_candidates_evaluated`: the pipeline checked existing grants
  and recorded candidate count plus coverage outcome.
- `approval.grant_matched`: an existing grant covered the request and direct
  pass was applied.
- `approval.secretary_recommended`: `auto on` asked Secretary for a one-time
  recommendation.
- `approval.reaction_window_started`: a visible countdown or reaction window
  was shown before applying a Secretary recommendation.
- `approval.decision_applied`: allow, deny, cancel, input answer, or wait was
  applied to the runtime.
- `approval.user_overrode`: the user changed or rejected a proposed Secretary
  or countdown decision before it was applied.
- `approval.expired`: the approval reached its expiry without a valid decision.
- `grant.materialized`: user selected `allow_for_session` or `allow_always` and
  the pipeline created the grant.
- `approval.runtime_result`: backend accepted, rejected, failed, or ignored the
  applied decision.

Structured input follows the same shape: request, grant check if applicable,
Secretary recommendation if `auto on`, user override if any, applied answer, and
runtime result.

### Metric Definitions

The primary quality question is:

> The system should not bother the user when it can safely act, must never
> auto-approve unsafe work, and must leave every automatic decision auditable,
> reversible, and explainable.

Metrics are computed over the unified approval/grant pipeline. `auto` is only a
decision context, not a separate metric owner.

| Metric | Denominator | Numerator | Exclusions | Primary evidence | Owner | Reading |
| --- | --- | --- | --- | --- | --- | --- |
| `unsafe_auto_rate` | Approval or structured-input requests marked destructive, credential-gated, external-side-effecting, ambiguous, high risk, or without a matching exact safe grant. | Requests in the denominator resolved by Secretary, countdown, or direct auto path without explicit user approval. | Requests covered by an active exact grant whose policy explicitly covers the risk class; requests where the backend never surfaced an approval/input request. | `Approval.risk/context/approvalOptions`, grant evaluation audit, decision audit, runtime result. | Approval pipeline. | Target is zero. This is the guardrail metric; do not trade it for convenience. |
| `grant_false_positive_rate` | Direct passes caused by an existing grant match. | Direct passes later followed by user override, grant revocation, reopen/undo, unsafe mark, or backend/runtime rejection attributable to the grant match. | Runtime failures unrelated to the approved action, network errors before the backend received the decision, manually edited Pod records with missing provenance. | `approval.grant_matched`, `approval.decision_applied`, `grant.revokedAt`, runtime result, later corrective audit. | Grant matcher. | Absence of later failure is not proof of correctness; it is a lagging precision signal. |
| `secretary_override_rate` | Secretary one-time recommendations that were shown in a reaction window. | Recommendations changed, cancelled, rejected, or converted to indefinite wait by the user before application. | Recommendations never shown to the user; direct grant passes; backend-native approvals not routed through shared approval. | `approval.secretary_recommended`, `approval.reaction_window_started`, `approval.user_overrode`, decision audit. | Secretary decision policy. | High rate means Secretary is overconfident, context-poor, or UI wording is unclear. |
| `unnecessary_wait_rate` | Requests that waited indefinitely for the user. | Waits where the user later selected the same one-time safe action that Secretary recommended or a high-confidence grant candidate would have selected. | High-risk/destructive/credential/ambiguous requests; requests where Secretary had no bounded context; requests with missing runtime options. | `approval.decision_applied` with `source=user`, grant candidate audit, Secretary recommendation audit, risk/context. | Approval pipeline. | Diagnostic only. Do not optimize by auto-passing unsafe requests. |
| `cross_surface_consistency` | Approvals visible from more than one surface or represented by both `Approval` and `Inbox`/`Audit` records. | Same approval URI has matching pending/decided/expired/grant-created state across CLI, Web, Inbox, and Audit. | Legacy records without stable approval URI; records outside the bounded query window. | `Approval.status/resolvedAt/expiresAt`, Inbox object/status projection, Audit action chain, Grant compiled/source links. | Shared core / surface sync. | Failures are projection/sync bugs, not user behavior. |
| `runtime_apply_success_rate` | Decisions applied to a backend/runtime. | Applied decisions accepted by the backend and reflected in runtime state. | Backend process crashed before receiving the decision; manual aborts unrelated to approval decision. | `approval.decision_applied`, `approval.runtime_result`, runtime session/checkpoint status. | Runtime adapter. | Low rate means protocol mapping or backend capability detection is wrong. |
| `expired_without_resolution_rate` | Requests with `expiresAt` or upstream timeout semantics. | Requests that reached expiry without a valid user, Secretary, grant, or timeout decision applied to runtime. | Requests cancelled because the parent session ended first. | `Approval.expiresAt/status/resolvedAt`, `approval.expired`, runtime result. | Approval pipeline / UI surfaces. | Indicates missing subscriber, stale UI, or unsafe indefinite waits where timeout was required. |
| `grant_reuse_rate` | Active grants. | Grants that later matched at least one distinct approval after materialization. | Revoked grants; grants created only for session-scoped work after the session ended. | `Grant.compiledFrom/source/sourceHash/related`, `approval.grant_matched`. | Grant lifecycle. | Low rate can mean grants are too narrow, users rarely need reuse, or grant creation UI is over-promoted. |
| `audit_completeness_rate` | Approval requests written to the shared approval plane. | Requests with a complete chain: requested, grant-evaluated, decision-applied or expired, runtime-result, and optional grant-materialized event. | Legacy records before this contract; runtime requests that never reached Pod because auth/storage was unavailable. | Audit chain keyed by approval URI plus Approval/Grant rows. | Shared core. | This measures whether quality can be trusted at all. |

Use these dimensions for every aggregate: `requestKind`, `risk`, `toolName`,
`target`, `action`, `runtime`, `session`, `chat`, `thread`, `decisionSource`,
`decisionRole`, `grantScope`, `policyVersion`, and surface. If a dimension is
not shared and queryable, it should be added to the shared model or the audit
event shape before it becomes a product KPI.

Do not treat "no user override" as proof that a decision was good. It is only a
signal. Strong quality evidence comes from later runtime success, absence of
reopen/undo, user validation, audit review, and safe behavior on similar future
requests.

### Data Foundation Fit

The current data foundation is close enough for first reporting because the
core resources already have the right anchors:

- `Approval` has stable request identity, session/chat/thread relations,
  tool-call identity, tool/action target, risk, status, options, decision
  identity, reason, policy version, expiry, and resolution time.
- `Grant` has policy text, provenance source/hash, compiled-from links, related
  resources, target/action, effect, risk ceiling, context, decision identity,
  lifecycle timestamps, and revocation.
- `Audit` is append-only and already links action, actor, session/chat/thread,
  tool call, approval, policy, policy version, and timestamp.
- `Inbox` can project the same approval URI to CLI/Web surfaces, so surface
  state can be compared without parsing private UI state.
- Runtime sidecar events already distinguish approval requests, control
  commands, risk, options, expiry, decision identity, and terminal runtime
  status before projection into Pod resources.

This means these reports are straightforward now:

- request counts by status, risk, tool name, runtime, session, and expiry;
- direct-pass counts when `approval.grant_matched` audits are written;
- Secretary recommendation and override counts when reaction-window audits are
  written;
- grant materialization and later reuse when grants link back to approvals via
  `compiledFrom`, `source`, or `sourceHash`;
- runtime apply success when adapters write `approval.runtime_result`;
- cross-surface consistency by comparing `Approval`, `Inbox`, `Audit`, and
  `Grant` state for the same approval URI.

The remaining work is small but important. Without it, reports can exist but
some metrics will be weak or inferred:

- Standardize audit action names to the dotted taxonomy in this document
  instead of local variants such as `approval_requested`.
- Persist grant candidate evaluation as structured audit data: candidate count,
  matched grant URI, coverage result, confidence/rank if used, and failure
  reason.
- Make `decisionSource` queryable. It can be derived short-term from audit
  action plus `decisionRole`, but a shared field or structured audit context is
  better for reporting.
- Persist reaction-window lifecycle events: recommendation shown, countdown
  started, user override, and final application.
- Persist runtime result explicitly for every applied decision.
- Represent grant scope explicitly enough to distinguish session-scoped grants
  from durable grants in reports. If scope is encoded in grant policy/context
  today, reporters must treat it as provisional until a shared queryable field
  exists.
- Add structured audit detail fields or a typed QA event resource if aggregate
  reporting needs fields beyond the current `Audit.action` plus URI pointers.

Do not create a parallel auto-mode telemetry schema first. The reporting source
of truth should remain `Approval`, `Grant`, `Audit`, `Inbox`, `Session`, and
runtime result records. A later analytics/export job may denormalize those
facts, but the denormalized report is not the authority.

### Diagnostic Signals

When quality is poor, the pipeline should be able to explain where it failed:

- no shared approval URI or exact lookup failed;
- upstream approval options were missing or mis-projected;
- expiry/reaction-window metadata was missing or inconsistent across surfaces;
- grant candidates existed but coverage was unclear;
- grant policy matched too broadly or too narrowly;
- Secretary lacked enough bounded context to decide;
- Secretary tried to decide a user-owned grant action;
- a destructive or credential-gated request entered countdown when it should
  have waited indefinitely;
- CLI and Web showed different state for the same approval;
- runtime rejected or ignored the applied response;
- grant materialization missed provenance or generalization boundary.

### Reporting Chain

The minimum chain is:

```text
Backend approval/input request
  -> shared Approval resource + Inbox projection
  -> grant candidate evaluation
  -> optional Secretary one-time recommendation
  -> optional reaction window / user override
  -> decision applied to runtime
  -> runtime result
  -> Audit events + optional grant materialization
  -> aggregate quality report
```

The aggregate quality report can be a local file-backed report in portable
runtime or a Pod-backed report in LinX. It should read shared approval, grant,
audit, session, and runtime records; it should not re-parse raw backend logs as
the primary source of truth.

### Event Shape

Quality events should be pointer-based and safe to index:

```json
{
  "action": "approval.secretary_recommended",
  "approval": "approval-uri",
  "grant": "grant-uri-if-any",
  "session": "session-uri",
  "runtime": "codex",
  "requestKind": "approval|structured_input",
  "risk": "low|medium|high",
  "decision": "allow|deny|cancel|input|wait",
  "source": "grant|secretary|user|timeout|runtime",
  "outcome": "pending|applied|overridden|expired|failed",
  "reason": "covered_by_grant|safe_once|ambiguous|destructive|missing_context",
  "createdAt": "..."
}
```

Do not copy raw prompts, secrets, tokens, file contents, private worker
transcripts, or full tool arguments into quality events. Store pointers, coarse
classifications, decision source, outcome, reason, and timestamps. Detailed
context stays on the approval/runtime records under their normal access control.

## Non-Goals

- Do not add `/manual` or `/smart` as product modes.
- Do not make `auto` a grant policy.
- Do not let the worker backend approve its own authorization request.
- Do not create grant resources from ordinary extension `select/confirm`
  prompts.
