# Symphony System Evolution Control Plane

## Status

This document defines the first-principles control-plane model for Symphony. It
is a concept guide, not a feature implementation spec. Feature contracts such as
worker goal dispatch, Codex bridging, Pod persistence, and Web/CLI adapters live
in their own specs, especially `docs/secretary/symphony-worker-goal-control-spec.md`.

Symphony exists to help Secretary manage system evolution: bind user input to
current system truth, decide whether the system should change, dispatch bounded
work, and feed evidence back into the control record.

## Documentation-First Control Surface

Symphony is documentation-first because workers and future agents need a stable
control surface. The control record is the source of execution truth: current
understanding, scope, constraints, acceptance, evidence, and next step.

Workers should execute from that record, not from a raw chat transcript. Raw
chat is useful source material, but it is not a bounded work contract and it is
not safe to pass hidden conversation deltas to active workers. When the user
steers ongoing work, Secretary first updates the control record, then sends a
bounded delta that names the changed sections and required action.

This prevents split-brain execution:

- one current truth field per mutable fact;
- one primary writer for each mutable state field;
- worker briefs point to the authoritative record and revision;
- evidence and findings flow back to the record after execution.

## Human-Friendly + AI-Friendly Documentation Contract

Control records must serve both humans and agents.

humans need a short narrative: what is true, what changed, what remains open,
and why the current decision is reasonable. agents need a control record: stable
sections, explicit state fields, evidence pointers, acceptance criteria,
compatibility impact, and next-step routing.

A good Symphony document therefore keeps both shapes in one file:

- a concise human-readable summary;
- structured sections such as Status, Current Truth, Active Work, Evidence,
  Open Questions, and Next Step;
- explicit rejected alternatives when they matter;
- links to related Issues, Tasks, Runs, Delivery packages, Reports, and
  Evidence rather than copied transcripts.

## State Axes

Symphony separates state axes instead of collapsing everything into `done`.

- System state: whether a capability/design/implementation is `existing`,
  `partial`, `verified`, `known-broken`, `deprecated`, `stale`, or
  `superseded`.
- Work state: whether a concrete execution item is `drafting`, `ready`,
  `running`, `blocked`, `reviewing`, `completed`, `failed`, or `cancelled`.
- Roadmap state: whether a future direction is `candidate`, `planned`,
  `deferred`, `rejected`, or `superseded`.
- Compatibility impact: whether a change is `compatible`, `behavior_change`,
  `breaking`, or `migration_required`.

Compatibility impact is not a status. A feature can be completed and still be a
breaking change. For breaking updates, Symphony should record the compatibility impact, migration or release boundary, and evidence before treating the work as
safe to publish.

## State Ownership Boundaries

Every mutable state field needs one primary writer.

- User owns intent, authority, privacy choices, destructive permission, and
  final user-owned acceptance.
- Secretary or the main control lane owns semantic state: system situation,
  binding, scope, acceptance, work split, compatibility impact, release
  boundary, and closure.
- Workers own execution observations: progress, feasibility findings, blockers,
  failed approaches, changed files, commands run, risks, and Implementation
  Change Requests.
- Runtime/controllers own attempt state: Session, Run, RunStep, process events,
  backend ids, approval/input events, and heartbeat/progress events.
- Reviewers/verifiers own findings and verification evidence.

`Evidence` is append-only proof. It should support, invalidate, block, or
recommend changes to another resource; it should not silently rewrite that
resource's lifecycle state.

Symphony product state is Pod-first when it is LinX-owned. Local archives are
runtime recovery/debug material or portable fallback, not the product authority
for Issue, Task, Delivery, Run, RunStep, Report, Evidence, ApprovalRequest,
InputRequest, InboxNotification, Contact, Chat, Thread, Message, or Agent state.
If the Pod write/read path is unhealthy, surface that as a product persistence
blocker instead of silently treating a local JSONL/archive as the shared truth.

Use the resource's natural shape:

- control-primary resources such as Issue, Task, Delivery, Run, RunStep,
  ApprovalRequest, InputRequest, and InboxNotification are structured modeled
  resources;
- file-primary resources such as long Reports, logs, patches, screenshots, and
  many Evidence artifacts are Pod files with modeled metadata;
- raw runtime transcripts and hidden prompt projections are runtime evidence or
  debug artifacts, not product Message content.

Application code should not decide resource paths, subject templates, RDF
predicates, or IRI resolution ad hoc. When a shared operation is missing, add it
to `@undefineds.co/models` / drizzle-solid / the shared store boundary and
consume it from LinX.

## Agent Runtime Config And Managed Resources

AgentRuntimeConfig is part of the managed system, not a hidden prompt blob.

- Agent root: the resource container that holds long-lived configuration,
  skills, backend defaults, system-managed surfaces, and user-managed surfaces.
- Agent WebID: optional actor identity used when an AI must be an auditable
  maker, requester, grant recipient, authorization subject, or credential
  holder.
- Runtime session snapshot: startup reads Agent meta and skill bindings, applies
  explicit launch/session overrides, then freezes the effective backend, model,
  credential source, skills, loaded package version, user-surface revisions, and
  authority policy into Session/Run metadata.

Resume should use the runtime session snapshot by default. A changed backend,
model, credential source, or authority policy is a new runtime session or an
explicit override record, not a silent mutation of an old run.

Agent roots and chats are different resources. The system-reserved Secretary
Agent lives at `/agents/__secretary__/` as a user-owned context/config folder.
That folder may contain system-managed package/skill surfaces and user-managed
overrides such as `AGENTS.md`, but runtime assembly is a projection of those
inputs, not a rewritten merged truth. The default Secretary Chat may reuse the
reserved key under the chat resource base, but it remains a Chat/Thread
timeline, not the Agent identity.

Worker identity should be discoverable through Contact/Agent resources, not
only through backend runtime rows. A worker contact such as `codex` identifies
the durable counterpart visible in chats and app UI. Backend, model, credential
source, launch args, local archive id, and process lifecycle belong on Agent
runtime config, Session, Run, and runtime metadata. Dispatch should choose from
available contacts/agents and then start a runtime; it should not make local
session ids stand in for participant identity.

## Decision Sufficiency And Escalation Necessity

Most decisions should be handled by the AI role that owns the relevant state.
Secretary should not ask the user for ordinary implementation details, routine
classification, obvious duplicate binding, or evidence bookkeeping.

Proceeding is sufficient when the decision stays inside the current control
boundary, the acting role owns the state being changed, the action is reversible
or non-destructive, and evidence can verify the result.

Escalation is necessary only when the missing information belongs to another
owner and cannot be safely inferred. The main control lane asks the user only for user-owned intent, authority, privacy, credentials, destructive permission,
long-lived grants, or final user-owned acceptance.

## Binding, Steering, And Change Control

For each meaningful user message, Secretary should compare the message with the
active record before creating work or steering workers. Capture is not gated by
`/symphony on`: ordinary chat may first create a lightweight Idea in Pod, and
Symphony only decides whether that captured Idea should be merged, promoted,
steered, or left as context.

Steering is the main place where "documentation-first" matters. A steering
message is not a side-channel instruction to workers, because workers may already have read an earlier version of the record. Secretary updates the
record, then sends a delta. The delta tells the worker where to look and what changed. Changes to scope, acceptance, compatibility, release boundary,
authority, or blocker policy must force a reread of the affected sections.

Typical binding outcomes:

- ordinary message: keep as chat, do not create an Issue;
- new concern: capture as Idea or Issue candidate;
- update existing: patch the active record;
- steering: update control state and send bounded delta;
- conflict: record incompatibility instead of silently mixing semantics;
- duplicate: link to existing work and avoid a second task;
- ask: escalate only when ownership requires it.

Do not treat every chat message as an issue. Symphony is a control surface, not
an automatic transcript-to-ticket converter.

## Release Plan Control

`ReleasePlan` records a rolling publish boundary: what is safe to ship now,
what remains open, what evidence is required, and what status must be updated
before publishing.

Symphony should manage release boundary, not human work-hour capacity. AI work
can keep running, but each release checkpoint needs a coherent verified slice.
The release decision is whether to keep going or publish the verified part now.
Consider how much work remains, whether the remaining work is risky or
uncertain, and whether the completed part already solves something urgent or valuable.

## Worker Role TODO

Initial Symphony should not require fixed worker roles. Use one bounded owner
for one coherent Work item by default. Role-based worker dispatch is future
LinX runtime capability.

When that capability exists, roles should be selected from contacts or created as AI contacts, and they should bind to Work, not create a new product semantic object or split Spec by themselves. Chat participants should be durable Contact
resources; backend/model/runtime facts belong on Agent, Session, Run, and
runtime metadata.

## Worker Feasibility Recheck

Workers must recheck feasibility before committing to implementation. This is
where execution discovers bad upstream judgment, incomplete acceptance,
unavailable dependencies, missing authority, or an unsafe split.

If the plan cannot be completed as written, the worker must not silently
downgrade acceptance. It writes an Implementation Change Request with evidence,
the failed assumption, what can be completed safely, and the recommended next
shape: split, redesign, defer, spike/report, reduce scope, or request missing
authority.

A worker may stop at the smallest coherent verified increment only when that
increment still satisfies current acceptance or the control lane has revised
acceptance. Otherwise the correct state is blocked/change-request, not a weak
claim of completion.

## Completion And Evidence Feedback

Completion is not a worker saying "done". Completion requires evidence that the
intended system change is true.

Accepted work must update the relevant control record status and evidence so
future workers do not need to reconstruct truth from transcript. After
execution, the control lane records what changed, which control record changed
and its new status, what evidence proves it, what remains open, and which
follow-up should happen next.

## Quality Metrics And Reporting

Symphony should record observable events that provide both outcome quality and
diagnostic signal.

Useful quality metrics include:

- accepted_delivery_rate: how often worker Delivery packages satisfy acceptance;
- reopened_task_rate: how often accepted work needs reopening;
- blocked_without_evidence_rate: how often work blocks without reusable proof;
- steering_success_rate: how often steering deltas successfully rebase active
  work without restart;
- duplicate_issue_rate: how often binding creates avoidable duplicate work.

## Reporting Chain

The reporting chain should be pointer-based:

```text
Audit -> RunStep -> Evidence -> Reports -> Issue/Task status updates
```

Do not start with a separate telemetry schema. Metric events should be small and pointer-based. They should point to control records, runs, deliveries,
reports, and evidence. They should not duplicate raw prompts, full transcripts,
secret values, credentials, private worker context, or long logs.

## Runtime Profiles And Portability

Portable runtimes such as Codex or Claude Code can use local Markdown/JSON
control records plus available tools. LinX runtime persists product control
state through modeled Pod/RDF resources and shared models/repositories.

LinX does not need these Pod/xpod control-plane operations for the portable
skill path. The portable Symphony skill defines behavior, control-lane rules,
worker protocol, and final report shape. Product Pod persistence is an adapter
responsibility.

## Declarative Runtime TODO

Future runtime configuration should become more declarative, but that is not a
requirement for the portable skill path. Open product work includes:

- Secretary/control-lane API for creating, splitting, closing, and projecting control records is future product work;
- create/update/split/supersede Spec;
- create/update/split/supersede Issue and Task;
- project runtime events into Message, RunStep, ApprovalRequest, InputRequest,
  Evidence, Report, and Delivery;
- Define the Secretary/control-lane API for LinX control-plane operations;
- Define the exact shared model/repository for Agent container meta.

## Related Docs

- `skills/symphony/SKILL.md` — portable Symphony control-lane behavior for
  Codex and other coding agents.
- `docs/secretary/symphony-worker-goal-control-spec.md` — product/runtime
  worker-goal implementation contract.
- `docs/agent-collaboration-model.md` — broader Secretary/worker collaboration
  model.
