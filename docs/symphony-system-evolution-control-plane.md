# Symphony System Evolution Control Plane

## Status

Draft concept contract. This document defines the first-principle product model
for Symphony. It is intentionally higher level than `/auto`, backend approval,
worker runtime, or a specific `Issue / Task / Run` schema.

## Core Definition

Symphony is the control plane for system evolution.

The system includes product semantics, implementation, runtime behavior, data
models, protocols, permissions, skills, documentation, deployment, dependencies,
current work, and future plans.

Symphony's job is not to make multiple agents chat. Its job is to keep system
evolution coherent while one or more agents change the system over time.

In product terms:

- `auto` controls who drives the current input loop when user input is needed.
- agent runtime controls one execution attempt.
- workers execute bounded slices of work.
- Symphony controls how the system should evolve, what work is active, how work
  is assigned, and how evidence updates the shared understanding of the system.

## Storage Authority

In LinX product runtime, Symphony state is Pod/TTL authoritative. Durable
records such as `Idea`, `Issue`, `Task`, `Delivery`, `Session`, `Run`,
`RunStep`, `Evidence`, and `Report` must be represented by shared
`@undefineds.co/models` resources and written through `drizzle-solid` so CLI,
App, and workers observe the same truth.

The authoritative conclusion record is not an arbitrary local file. A completed
or reviewed work item closes through a Pod `Report` linked to the relevant
`Issue`, `Task`, `Delivery`, `Run`, `Thread`, and supporting `Evidence`.
Repository documents may be implementation authority, design source, portable
runtime control records, or no-Pod recovery material, but they are not the
cross-client conclusion authority when a LinX Pod session exists.

This does not mean the portable Symphony runtime module owns Pod IO.
`packages/agent-runtime/src/symphony.ts` is a storage-agnostic control-plan and
prompt contract: it may create DTOs, URIs, projections, and worker prompts, but
must not call Pod APIs, shell out to `xpod`, import `drizzle-solid`, or decide
resource paths. LinX product code persists those DTOs through shared
models/repositories. Portable agents or scripts may use `xpod` CLI commands
when that is the available tool surface, but that is an adapter/tool choice, not
the core Symphony contract.

When LinX Agent Runtime gives a Secretary or worker Pod authority, that
authority must extend to Pod-facing tools invoked inside the same runtime.
`xpod` should consume the runtime-provided authority bridge and report the
effective identity; it should not require a separate `xpod auth login` and
should not fall back to unrelated app-local or legacy auth files.

Local files under `$LINX_HOME/symphony` are not a second product model. By
default, `LINX_HOME` resolves to `$SOLID_HOME/apps/linx`, and `SOLID_HOME`
defaults to `~/.solid`. When a Pod
session exists, the local durable mirror should be pulled from the Pod RDF graph
as JSON-LD, not authored as an independent business JSON schema. Portable
runtime JSON, tests, and no-Pod recovery files are allowed only as adapter/cache
material; they must not replace TTL resources or become the source of Symphony
truth.

## Agent Runtime Configuration And Skills

AgentRuntimeConfig is part of the managed system, not an invisible prompt
assembly detail. In LinX runtime, an Agent is a container resource. The Agent's
default backend/model/credential/tool/skill policy belongs to metadata for that
container. In a Solid-backed Pod this means the container can be described by a
`.meta` document whose subject is the container itself, not the `.meta` file.

Use this shape as the product direction:

- Agent root: the resource container and context folder, for example an AI
  Secretary folder.
- Agent meta: default runtime config, skill bindings, display/name metadata,
  capability envelope, and policy pointers for that Agent container.
- Agent context surfaces: system-managed files/resources and user-managed
  files/resources live in the same Agent folder, but keep separate authority.
  This is closer to the relationship between a platform/system message and a
  repository `AGENTS.md` file than to a field-level overlay. The system package
  may update system-managed surfaces; the user may edit user-managed surfaces.
  They must not be collapsed into one mutable prompt/config blob.
- Agent WebID: optional actor identity, separate from Agent root. It is needed
  only when the AI Agent receives grants, acts as maker/actor/requester, holds
  credentials, or needs independent authorization/audit identity.
- Skills: file-backed resources such as `SKILL.md` and related files. Metadata
  records enabled state, version, source, checksum, load policy, dependencies,
  and relations. An Agent-scoped skill resource is a binding/installation fact,
  not the global reusable skill definition. External or shared skills are
  referenced through source/version/checksum/root and may be materialized into
  an Agent-local folder without changing their reusable source identity.
- Runtime session snapshot: startup reads Agent meta and skill bindings, applies
  launch or session overrides, then freezes the effective backend, model,
  credentialSource, skills, and authority/tool policy into Session/Run metadata.

Default Secretary identity uses the system-reserved persisted key
`__secretary__` and the Agent resource shape
`/agents/__secretary__/`. A Solid `.meta` document may describe that container,
but it is not the Agent resource identity. The default Secretary Chat may use
the same reserved key under the Chat resource base, for example
`/.data/chat/__secretary__/index.ttl#this`; this is distinct from the Agent
root `/agents/__secretary__/`. Do not introduce non-reserved Secretary slugs for
durable Agent or Chat resources.

The Secretary folder is the stable user-owned context root. It may contain
system-managed surfaces such as the installed Secretary package record and
system skill bindings, plus user-managed surfaces such as `AGENTS.md`,
preferences, user-installed skills, and optional forked skills. System upgrades
may replace or migrate only system-managed surfaces. User-managed surfaces
survive upgrades unchanged unless the user explicitly edits, rebases, or accepts
a migration. If a user modifies a system skill, model it as a user-managed fork
or override binding, not as an in-place mutation of the system package.

Runtime startup projects the folder into an effective prompt/config in
authority order, for example platform rules, LinX Secretary system package,
Agent `AGENTS.md`, enabled skill files, then session messages. The projection is
not a new source of truth. Session/Run metadata records the system package
version, user surface revisions, and skill checksums that were actually loaded.

Resume should use the runtime session snapshot by default. A different
backend/model/credential source should produce a new runtime session or an
explicit override record. It must not silently mutate what an old Session/Run
meant.

Ordinary system resources do not become WebIDs. Issues, Tasks, Runs, Evidence,
Reports, Deliveries, files, and skills use resource URIs and optional metadata;
only actor-like agents need WebID identity.

## Why This Exists

As LinX grows, the hard problem is not dispatching work. The hard problem is
that AI needs to know:

- what capabilities exist now;
- why they were designed this way;
- what has actually been implemented;
- what is still planned, partial, stale, blocked, or deprecated;
- what work is currently active;
- which new user message changes an existing direction;
- which request conflicts with existing product semantics;
- what evidence proves that a change landed correctly.

Without this layer, Symphony becomes a task router, a chat room, or a loose
issue tracker. With this layer, Symphony can manage long-running system change
without losing design intent or execution state.

## The Control Loop

Symphony should operate as a closed loop:

```text
System Situation
  -> Evolution Judgment
  -> Execution Control
  -> Evidence Feedback
  -> updated System Situation
```

The loop matters more than any individual object name.

## Documentation-First Control Surface

Symphony should treat durable system knowledge as the control surface for work,
not as an after-the-fact report.

Before non-trivial worker execution, Symphony should create or update the
relevant design/spec/status record. Workers should execute from that record, not
from a raw chat transcript. After work finishes, the result must update the same
record with status and evidence.

This gives the system one place to answer:

- what the requirement is after discussion and clarification;
- which existing capability, design, spec, issue, or work item it changes;
- whether the change is new, an update, steering, duplicate, conflict, or future
  roadmap;
- who owns execution and what acceptance means;
- what evidence changed the system situation.

Steering is the main place where "documentation-first" matters. A steering
message is not a side-channel instruction to workers. Symphony should first
compare the message with the active record, then update the record's current
truth, active work, acceptance, release boundary, or open questions as needed.
Only after that should it deliver a bounded delta to workers: continue with a
new constraint, restart, cancel, split, defer, or report blocked. It should not
push fresh chat context directly into workers as an implicit change of scope.

The reason is practical: workers may already have read an earlier version of the
record, and model context may keep stale assumptions alive. A steering delivery
therefore needs both a pointer to the authoritative record and a compact change
summary. The delta tells the worker where to look and what changed; it is not
the source of truth by itself.

A useful steering delivery says:

```text
Control record updated
Record: docs/or/pod/record-uri
Previous revision/hash: ...
Current revision/hash: ...
Changed sections: Scope, Acceptance, Release Boundary
Superseded assumptions: ...
Delta summary: ...
Action: reread these authoritative sections before continuing
```

Not every update requires rereading the whole record. Small execution evidence
updates can be consumed as a delta. Changes to scope, acceptance, release
boundary, compatibility impact, privacy, authority, dependency, or blocker rules
must force a reread of the affected sections. If the change invalidates the
current run, Symphony should cancel or restart that run from the updated record
instead of layering more chat instructions on top of stale context.

## Human-Friendly + AI-Friendly Documentation Contract

For Symphony, docs should serve two readers at once:

- humans need a short narrative that explains why the change exists, what the
  current state is, and what happens next;
- agents need a control record that can be read, compared, executed, and
  updated without reconstructing truth from chat history.

A Symphony doc should make these things easy to find for both:

- what this document controls;
- what the current truth is right now;
- what is still open, blocked, planned, or stale;
- who owns the next step;
- what evidence changed the state;
- whether the change is compatible, behavior-changing, breaking, or migration
  required;
- what was superseded and should not be reused.

Use stable section names across related docs so agents can compare them quickly
and humans can skim them predictably. Prefer a small, repeated structure over
free-form narrative. A useful default shape is:

```text
Status
Scope
Current Truth
Active Work
Compatibility Impact
Evidence
Open Questions
Next Step
Related Docs
```

Keep current truth separate from history. Put stale notes, rejected options, and
superseded decisions under their own heading instead of mixing them into the
main narrative. When a new requirement arrives, update the control record first
and only then steer execution. This lets every worker consume the same current
truth instead of reconstructing scope from a private chat fragment. The
human-readable summary should stay short; the machine-readable sections should
stay explicit.

## 1. System Situation

System Situation answers: what is the system's real current state?

It should include, when relevant:

- current capabilities and their user-facing semantics;
- design intent and rejected alternatives;
- implementation locations such as code, config, skills, docs, models, and tests;
- current status such as planned, active, partial, verified, blocked, deprecated,
  or known-broken;
- active specs, work items, owners, dependencies, and blockers;
- recent evidence such as test results, review findings, logs, user validation,
  commits, and deployment state;
- stale or superseded decisions that should not be reused as current truth.

This is not just organizational memory. It is the current operating picture that
agents need before they decide what to do.

### State Classification

Symphony should distinguish these state axes instead of collapsing them into one
status field:

- System state: whether a capability/design/implementation is `existing`,
  `partial`, `verified`, `known-broken`, `deprecated`, `stale`, or `superseded`.
- Work state: whether a concrete execution item is `drafting`, `ready`,
  `running`, `blocked`, `reviewing`, `completed`, `failed`, or `cancelled`.
- Roadmap state: whether a future direction is `candidate`, `planned`,
  `deferred`, `rejected`, or `superseded`.
- Compatibility impact: whether a change is `compatible`, `behavior_change`,
  `breaking`, or `migration_required`.

Compatibility impact is not a status. A breaking change may be planned, running,
blocked, or verified. Marking it separately forces Symphony to preserve the
reason, affected surfaces, migration plan, tests, and rollback story.

### State Ownership Boundaries

Symphony needs explicit write ownership for each state surface. Otherwise the
same field will be overwritten by user chat, Secretary judgment, worker
execution, runtime events, and verifier findings.

The intended boundary is:

- User messages express intent, authority, and acceptance input. They do not
  directly become Issues, Specs, or Work without Evolution Judgment.
- Secretary or the main control lane owns semantic state: System Situation,
  Spec status, acceptance, compatibility impact, Work split/assignment,
  supersession, and closure.
- Workers own execution observations for assigned Work: progress, blockers,
  failed assumptions, implementation facts, Implementation Change Requests, and
  proposed deliveries. Workers do not change product semantics or close Specs.
- Runtime/controllers own attempt state: Run lifecycle, tool events, retries,
  cancellation, and observed execution status. They do not reinterpret
  requirements.
- Reviewers/verifiers own findings and evidence. They can recommend close,
  reopen, split, or reject, but the control lane updates authoritative state.

Pod access follows the same ownership boundary. Workers may read the assigned
control record, relevant context, and evidence from Pod when LinX grants that
capability. Workers may write execution-facing facts such as Run/RunStep,
progress, blocker reports, Evidence, Delivery reports, and Implementation
Change Requests. They must not directly mutate user intent, acceptance, Spec
truth, Issue closure, work split, compatibility impact, roadmap state, grants,
or product capability truth. If a non-LinX worker cannot access Pod, it reports
the same facts in a structured delivery and the Secretary/control lane writes
them to Pod. All structured Pod reads and writes must go through
`@undefineds.co/models` / `drizzle-solid` or the equivalent shared model API;
raw TTL/HTTP access is only a file/RDF serialization boundary, not the business
data path.

LinX should project that boundary as data, not only as prompt text. Assigned
Task, Delivery, Run, Session, and worker metadata should carry a worker access
policy that states read scope, write scope, forbidden scope, assigned resource
URIs, and no-Pod fallback behavior. The policy is still enforced by runtime and
approval code, but making it visible in Pod lets CLI, Web, Secretary, workers,
and future controllers reason about the same contract.

Issue and implementation documentation should also stay split by authority.
Pod Issue/Spec/Task records are the control authority for status, scope,
acceptance, work split, ownership, closure, and cross-client coordination.
Repository docs are the implementation authority for code-adjacent design,
behavior notes, tests, examples, migration details, and file-level evidence.
Project-local work briefs can mirror or link to Pod records, but they must carry
the Pod URI and must not become a second Issue truth. When implementation
evidence contradicts the Pod control record, the worker writes an
Implementation Change Request; the control lane then updates Pod and the repo
docs together.

Resource state should follow the same pattern:

- `Message` is an immutable source event.
- `Idea` is a candidate extracted from one or more messages. It preserves a
  possible direction before there is enough commitment, scope, or acceptance to
  call it a requirement.
- `Spec` holds desired system change, acceptance, non-goals, compatibility
  impact, and semantic status.
- `Work` or `Task` holds execution scope, owner, dependencies, blocker rules,
  and work state.
- `Run` holds one runtime execution attempt and its lifecycle/events.
- `Delivery` is a proposed result package, not accepted truth.
- `Evidence` is append-only proof or finding; it changes status only when the
  owning role evaluates it.
- `Capability` or system state records accepted current truth.
- `Roadmap` records future direction until promoted to active Work.
- `ReleasePlan` records a rolling publish boundary: what is safe to ship now,
  what remains open after release, what is deferred/rejected, and what
  evidence/status must be updated before publishing.
When a role needs to change a state field it does not own, it should write a
proposal, finding, or Implementation Change Request. The owner then applies,
splits, rejects, or escalates it.

### Decision Sufficiency And Escalation Necessity

Symphony should not turn every uncertain moment into a user question or a fixed
checklist. Most decisions should be handled by the AI role that owns the
relevant state, then recorded as a decision, evidence gap, follow-up, proposal,
or change request.

Proceeding is sufficient when the decision stays inside the current control
boundary: the input binds to one active object or to a safe proposal, the
responsible role owns the state being changed, acceptance/evidence can be
derived from current records, the action is reversible or non-destructive, and
uncertainty can be honestly recorded without misleading the release state.

Escalation is necessary only when the missing information belongs to another
owner and cannot be safely inferred. Workers escalate to Secretary or the
control lane first. The control lane asks the user only for user-owned intent,
authority, privacy, credentials, destructive permission, or final acceptance.

This keeps Symphony autonomous without becoming boundaryless: AI decides routine
binding, implementation, evidence, duplicate, release bookkeeping, and follow-up
placement; it escalates only when the decision would change product semantics,
authority, acceptance, compatibility impact, or publish boundary beyond its
ownership.

### Idea Management

`Idea` is the buffer layer between raw `Message` and committed `Spec / Issue /
Task`. It lets Symphony remember useful fragments without pretending that every
fragment is a requirement.

An Idea should be captured when a message introduces or refines a possible
system direction, product capability, modeling principle, or improvement area,
but the problem, scope, acceptance, or commitment is still incomplete. It should
not be used for ordinary conversation, game play, one-off explanations, or
messages that clearly bind to an existing active record.

A useful Idea record contains:

- short summary;
- source message or event references;
- affected system area;
- status such as `captured`, `exploring`, `candidate`, `promoted`, `deferred`,
  `rejected`, or `superseded`;
- commitment such as `thought`, `direction`, `tentative_decision`, or
  `committed`;
- current understanding;
- open questions;
- related records and possible conflicts;
- next step.

Promotion should use gates, not scoring:

- to become a Requirement Candidate, the Idea needs a problem, affected area,
  value, stable current understanding, and explicit open questions;
- to become a Spec, it also needs expected behavior, scope, compatibility
  impact, acceptance, and commitment;
- to become Work/Task, it also needs an implementation boundary, evidence plan,
  and blocker rules.

Symphony can automatically capture and merge Ideas when active. It must not
automatically upgrade an Idea into committed product semantics or dispatchable
work unless the promotion gates are satisfied.

## 2. Evolution Judgment

Evolution Judgment answers: what, if anything, should this input change?

For each meaningful user message or system event, Symphony should classify
whether it is:

- ordinary conversation;
- a new system concern;
- a change to an existing capability, spec, or work item;
- steering for active execution;
- a bug or regression against expected behavior;
- a conflict with current product semantics;
- a duplicate of an existing open concern;
- something that should be deferred until an active branch lands.

The key action is binding the input to the correct design or implementation
object. A request should not become an isolated task until Symphony knows what
part of the system it is trying to evolve.

For breaking updates, Symphony should record the compatibility impact on the
spec or decision before work starts. At minimum, the record should name the
affected user behavior, commands, APIs, models, storage, docs, tests, migration
requirements, and any rejected compatibility-preserving alternative.

### Release Plan Control

Symphony should manage release boundary, not human work-hour capacity. AI can
continue working and publish repeatedly, but each release checkpoint still needs
an explicit boundary, evidence, and state feedback.

The practical decision is often whether to keep going or publish the verified
part now. The control lane should compare how much work remains, how uncertain
or risky the remaining work is, and whether the completed part already solves
something urgent or valuable. If the completed part is coherent, verified, and
urgent enough on its own, Symphony should close that release boundary and leave
the remaining scope open instead of delaying useful delivery.

There is no complete fixed rule for this. User importance, urgency, current
system condition, unknown implementation cost, evidence burden, worker findings,
and release safety interact in ways that cannot all be enumerated ahead of
time. The control lane and workers need judgment.

The requirement is therefore not a scoring formula. The requirement is that
scope decisions are explicit: if a new concern, steering input, or worker change
request changes the publish boundary, the record should say why it stays in the
current publish boundary, remains open after release, needs a spike, conflicts
with current semantics, or requires a split. When unsure, workers should return
a proposal or Implementation Change Request instead of silently expanding active
Work.

## 3. Execution Control

Execution Control answers: who is responsible for the next step, under what
boundary, and how will completion be checked?

It covers:

- creating or updating specs, issues, tasks, deliveries, sessions, runs, and
  reports only when they are useful;
- clarifying requirements enough to update the control record before dispatch;
- deciding whether Secretary, a worker agent, the user, or an external system
  owns the next step;
- splitting work only when ownership, parallelism, or specialization justifies
  the split;
- carrying acceptance criteria, context boundaries, dependencies, and blocker
  rules into worker dispatch;
- handling steering while work is in progress;
- escalating to the user for authority, credentials, destructive changes,
  privacy or visibility ambiguity, or unclear acceptance.

Execution Control is the part that uses multiple agents, but it is not the
whole Symphony model.

### Runtime Space Model

Symphony does not put the主理人 and workers into one undifferentiated space,
but it also does not require every worker to be isolated. It separates three
spaces so the product can coordinate multiple agents while choosing the right
topology for each Thread:

- Control space is shared. Pod/control records such as Issue, Spec, Task,
  Delivery, Session, Run, RunStep, Evidence, and Report are the common
  coordination surface observed by Secretary, workers, UI, and runtime
  adapters.
- Runtime session topology is explicit. Some Threads use one shared room where
  Secretary and workers collaborate directly. Other Threads use separate
  backend sessions reached through runtime input projection or control events.
  Delivery remains the stage/result package, not the generic message transport.
  Symphony should record the chosen topology instead of assuming that worker
  execution always means a separate transcript.
- Workspace allocation is Thread-first, not Agent-first. A simple Thread may be
  handled by one worker in one worktree, with Secretary joining only when
  useful. If three AIs need to solve the same Thread together, they should
  normally share one workspace so edits, tests, and evidence stay coherent.
  Independent Threads may use separate worktrees for isolation.
- Workspace identity is still environment-scoped. Workers in different
  environments must align file work through portable revision, artifact, patch,
  checksum, and evidence references.

This gives Symphony one shared state model without forcing one shared chat
context or one global filesystem.

### Group Reconciler And Thread Design

LinX should model group coordination through `Chat`, `Thread`, and a program
reconciler, not through direct agent-to-agent wakeups.

`Chat` is already group-capable. It is the long-lived collaboration surface:
direct chat, group chat, Symphony room, project room, or system room. `Thread`
is the concrete work site or timeline under a Chat. All member-visible messages,
runtime events, requests, deliveries, approvals, and schedule ticks land in a
Thread first. A member does not directly wake another member.

Use this separation:

```text
ThreadBus
  append / subscribe only

Reconciler
  observes Thread state, classifies events, deduplicates, applies policy,
  creates WakeJobs, and updates control state

Scheduler
  queues WakeJobs, applies locks/priority/retry/timeout, and starts Runs
```

The reconciler is a program/runtime component, not the Secretary. The Secretary
is an important agent role inside a Thread. The reconciler may wake the
Secretary; the Secretary then reasons about user intent, worker steering,
approval, input, or acceptance. This keeps mechanical routing separate from
semantic judgment.

`WakeJob` is an ephemeral scheduler intent. It may be queued in memory and
deduped by the runtime, but it is not a durable control record and should not be
modeled as a Pod resource. Durable truth lives in Thread events, Delivery,
Approval/InputRequest, Run, RunStep, Evidence, and the control record fields
that reference them.

The default event flow is:

```text
Message / ControlEvent / Delivery / InboxItem appended to Thread
  -> Reconciler observes it
  -> Reconciler creates or skips a WakeJob according to Thread policy
  -> Scheduler runs the selected Agent Runtime
  -> Agent output appends back to Thread
```

Thread `Message` is durable conversation truth: who said what, in which
Thread, with which maker/source context. Runtime LLM input is a separate
projection derived from that truth plus Goal/Steer/Run state and backend
protocol constraints. A projection may rewrite roles and context windows, but
it must not overwrite who actually produced the Thread message. For example,
when Secretary supplies a backend `user` input, Thread truth still records
Secretary's runtime intent, while the adapter records the concrete runtime
projection separately on execution-side data such as `Run.input`, `RunStep.data`,
or `Delivery.projection`.

Worker tools may submit explicit control events such as `input.required`,
`approval.required`, `delivery.submitted`, `change.requested`, or
`worker.blocked`. This is not a direct wakeup. It is a structured request to the
same reconciler/scheduler path, with less ambiguity than classifying free-form
chat. Plain worker messages can also be classified by the reconciler when a
tool was not used.

Thread policy decides which agents are awakened:

```text
direct
  user message -> default assistant

auto
  input/approval/blocker in this Thread -> same-Thread Secretary

symphony
  issue/task/run/delivery events -> same-Thread Secretary or assigned worker

open_group
  mentions/subscriptions/policy -> selected agents

review
  delivery.submitted -> Secretary/reviewer
```

`auto` is therefore not a separate Symphony protocol. A Symphony worker Thread
can be in auto mode just like a normal backend Thread: when the worker needs
input or approval, the same-Thread Secretary handles it first. If the Secretary
can answer within policy, it appends the response/projection and the worker
continues. If not, the request becomes pending for a human or higher-level
Secretary through the Inbox/control surface.

Inbox is the ledger for input and approval requests, not an alternate chat
route. Every input/approval request should have an Inbox/control record whether
it is still pending or already handled by Secretary. This gives CLI, Web, and
future clients the same audit surface:

```text
worker/runtime needs input or approval
  -> InboxItem(status=pending or handling) linked to Thread/Run/source Message
  -> same-Thread Secretary may resolve it
  -> InboxItem(status=resolved/rejected/expired) records decision and actor
```

If the user is actively talking with a main Secretary, that Secretary may bring
pending Inbox items into the current conversation. If the user is not active,
pending items can remain visible in Inbox without interrupting the user unless
urgency, expiry, or risk policy says otherwise.

Delivery is a stage boundary, not the general message transport. Ordinary
questions, answers, steering, and checkpoints are Messages. A Delivery packages
stage/final results, patches, artifacts, evidence, risks, or handoff data for
review. Submitting a Delivery appends a `delivery.submitted` event to the
Thread; the reconciler decides whether to wake Secretary/reviewer immediately,
queue it, or batch it with a later inspection.

Schedules are event sources. A Schedule only says when to emit an event, what
the event means, and who or what policy should handle it. It is not a separate
execution container:

```text
Schedule tick
  -> schedule.tick ControlEvent
  -> append to a Thread
  -> normal reconcile / WakeJob / Run flow
```

Each Schedule should have a stable schedule main Thread under its owning Chat
or the system Chat. The main Thread preserves continuity across ticks: tick
events, summaries, status changes, and cross-run evidence. A specific tick can
stay in that main Thread when work is short and low-noise. When work is long,
multi-step, noisy, worker-owned, or needs separate review, the reconciler should
split a child execution Thread and report back to the schedule main Thread.

Thread splitting should be explicit:

```text
Thread {
  chat
  kind: main | control | worker | review | schedule | schedule_run
  parentThread?
  rootThread?
  splitFrom?
  splitReason?
  status
  workspace?
  policyOverride?
}
```

Use simple placement defaults:

```text
schedule.tick
  -> schedule main Thread; split child execution Thread only when needed

event with an existing Thread
  -> reconcile in that Thread

event with Chat but no Thread
  -> Chat control Thread

event with no Chat
  -> system control Thread
```

This gives Symphony a consistent group model: Chat is the durable groupable
space, Thread is the observable work site, Reconciler is the program controller,
Secretary is an in-Thread agent role, and all event-like work enters the same
Thread-based reconciliation path.

### Worker Workspace Alignment

Workers can run in multiple environments. The workspace for a Thread is the
workspace mounted or checked out in the assigned runtime environment. Multiple
workers on the same Thread in the same environment should normally share that
workspace. What is not global is the absolute path: it is not
automatically shared with Secretary, the user TUI, Web, or sibling workers that
run elsewhere.

Symphony therefore must not align files by assuming absolute paths are equal
across environments. The control record should align work with portable
references:

- control object URI: Issue, Spec, Task, Delivery, Session, Run, Evidence;
- environment identity: local shell, remote container, cloud runner, Codex,
  Claude Code, CodeBuddy, or another runtime profile;
- workspace identity: repository URL, branch, commit/base revision, worktree
  label, runner workspace URI, or container/workspace descriptor;
- artifact identity: repo-relative path, checksum, etag, blob URI, patch URI,
  archive URI, offset, and content type.

Repo-relative paths are useful for human and agent navigation, but they only
name a logical location. They prove file equivalence only when paired with a
base revision, checksum, etag, or artifact URI.

The default file flow is:

```text
worker workspace -> patch/artifact/evidence -> Pod/control record
Pod/control record -> patch/artifact/evidence -> target workspace
```

Workers write in their own workspace. They report changed files, base revision,
diff or patch artifact, verification evidence, and any uncommitted local state.
Secretary/control lane decides whether the result is accepted, needs steering,
or must be applied/replayed in another environment.

This keeps Pod Issue/Spec/Task as the control authority while avoiding a false
assumption that every worker can see the same local filesystem. Local files can
be mirrors, logs, patches, or workspace-specific materializations, but they are
not cross-environment truth by themselves.

### Worker Role TODO

Initial Symphony should not require fixed worker roles. The default execution
unit is one bounded worker owning one coherent Work item. The control lane
should split or specialize workers only when independent acceptance, sequencing,
expertise, review, or verification value justifies it.

Role-based dispatch is a future LinX runtime capability. When implemented, roles
such as architect, executor, verifier, researcher, or reviewer should be
execution profiles selected from contacts or created as AI contacts when no
suitable contact exists. A role assignment should bind to Work, not create a new
product semantic object and not split a Spec by itself.

### Worker Feasibility Recheck

Worker execution is also a feedback surface for bad upstream judgment. A worker
must recheck feasibility against the actual codebase, runtime, dependencies,
permissions, and tests before committing to implementation.

If the worker discovers that the assigned plan cannot be fully implemented under
the current control record, it should not quietly weaken acceptance or produce a
partial result as if it were done. It should write an Implementation Change
Request back to the control record with the failed assumption, evidence, safe
partial path if one exists, and recommended next shape: split, redesign, defer,
spike/report, reduce scope, or request missing authority.

This is how Symphony detects that a task was too large, the design was wrong,
or execution needs a different sequence. "见好就收" means stopping at the
smallest coherent verified increment only when that increment satisfies current
acceptance or after the control lane revises acceptance. Otherwise the correct
delivery is blocked/change-request, not an incomplete implementation.

## 4. Evidence Feedback

Evidence Feedback answers: did the system situation actually change?

Completion is not a worker saying "done". Evidence may include:

- tests, typecheck, lint, smoke runs, or integration runs;
- diffs and file references;
- runtime logs and reproduced behavior;
- review findings and fixes;
- user validation;
- Pod projections, audit entries, reports, or delivery records;
- commit messages and release notes.

After execution, Symphony should update the system situation with what changed,
what remains open, which assumptions were confirmed or rejected, and what should
be ignored as obsolete.

## 5. Quality Metrics And Reporting

Symphony needs feedback loops for itself. The goal is not generic analytics and
not model surveillance. The goal is to know whether the control plane is making
system evolution more coherent, faster to recover, easier to verify, and safer
to delegate.

Metrics should answer two different questions:

- outcome quality: did the user and system get a coherent, verified change with
  less forgotten context and fewer unsafe decisions;
- diagnostic signal: if the result was bad, which control-plane step failed:
  binding, documentation, dispatch, worker feasibility, evidence, release
  boundary, approval, or projection.

### Outcome Metrics

These are the core product health signals:

- `accepted_delivery_rate`: deliveries accepted after review divided by proposed
  deliveries.
- `reopen_rate`: accepted or closed work later reopened because acceptance,
  evidence, or product semantics were wrong.
- `evidence_sufficiency_rate`: completed work with required evidence present
  before closure.
- `control_record_freshness`: active work whose current truth, status, and next
  step were updated after the latest meaningful event.
- `duplicate_avoidance_rate`: user inputs correctly linked to existing open
  concerns instead of creating duplicate work.
- `steering_success_rate`: steering events that updated the record and resulted
  in workers using the new scope without stale-context drift.
- `blocked_escalation_quality`: blocked cases that reached the correct owner
  with enough context and no direct worker-to-user leakage.
- `release_boundary_accuracy`: releases where the shipped slice matched the
  recorded boundary and remaining work stayed open.

### Diagnostic Metrics

These explain why Symphony performed well or poorly:

- classification counts: ordinary, new, update, steering, bug, conflict,
  duplicate, defer, ask.
- binding confidence and correction rate: how often Secretary's initial binding
  was corrected by user, worker, or verifier.
- time-to-first-control-record-update and time-to-dispatch.
- worker Implementation Change Request count and reason: infeasible, too broad,
  wrong assumption, missing authority, missing dependency, unsafe, or blocked.
- run outcome counts: planned, running, completed, failed, cancelled, retried.
- projection health: Pod projection succeeded, degraded to local cache, or
  failed with recovery pending.
- evidence gap count by kind: no test, no integration run, no runtime log, no
  user validation, no migration note, or stale doc.
- privacy/authority escalations: how often target visibility, credentials,
  secrets, destructive changes, or external calls required user input.
- stale-context incidents: worker used superseded scope, acceptance, or release
  boundary after steering.

### Reporting Chain

Do not start with a separate telemetry schema. First reuse the existing
control-plane resources:

```text
User/Runtime event
  -> Secretary classification and control-record update
  -> Audit event for the control-plane transition
  -> Work/Run/RunStep/Delivery status update during execution
  -> Evidence or finding appended by worker/reviewer/runtime
  -> Report/Review summarizes outcome and metric facts
  -> periodic aggregate reads Audit + RunStep + Evidence + Reports
```

In LinX, this maps to existing product surfaces:

- `Audit` records append-only control events such as `symphony.classified`,
  `symphony.record_updated`, `symphony.dispatched`, `symphony.steered`,
  `symphony.change_requested`, `symphony.blocked`, `symphony.completed`,
  `symphony.reopened`, and `symphony.release_boundary_changed`.
- `Run` and `RunStep` record runtime attempt facts, retries, failures, tool
  events, and projection health.
- `Delivery` records proposed result packages and whether they were accepted,
  rejected, superseded, or still reviewing.
- `Evidence` records proof and findings. It should point to tests, logs, diffs,
  reports, user validation, Pod projection, or review findings.
- `Report/Review` records the closure summary and the metric-relevant outcome:
  accepted, rejected, reopened, partial release, deferred, blocked, or changed
  request.

For Codex or Claude Code portable use, the same chain can be file-backed:
append events to the local control record or adjacent JSONL, write worker
evidence into the assigned work record, and write the final report with metric
facts. LinX can later project those records into Pod without changing the
portable skill semantics.

### Event Shape

Metric events should be small and pointer-based:

```json
{
  "action": "symphony.steered",
  "subject": "spec-or-work-uri",
  "source": "message-uri-or-event-id",
  "run": "run-uri",
  "delivery": "delivery-uri",
  "classification": "steering",
  "outcome": "accepted|rejected|blocked|partial|superseded",
  "reason": "scope_changed",
  "evidence": ["evidence-uri"],
  "createdAt": "..."
}
```

The event should store stable references, categories, timestamps, outcome, and
short reason codes. It should not duplicate raw prompts, full transcripts,
secret values, private worker context, or large logs. Sensitive material stays
in the source record with normal access control; metrics point to it only when
the reader has authority.

### How To Judge Good Or Bad

Symphony is doing well when:

- user fragments bind to the correct existing or new control record;
- workers execute from current docs rather than stale chat memory;
- blockers and change requests are surfaced early instead of becoming fake
  completion;
- accepted deliveries have enough evidence;
- reopened work is rare and explains what was missed;
- release boundaries are explicit and leave remaining work visible;
- cross-client state can be reconstructed from control records, audit, runs,
  deliveries, evidence, and reports.

Symphony is doing poorly when:

- many issues are duplicated or later merged manually;
- workers ask the user directly instead of escalating to Secretary/control lane;
- "done" reports lack evidence;
- completed work is reopened often because acceptance or product semantics were
  wrong;
- steering appears in chat but not in the control record;
- release boundaries are unclear or partial work is presented as complete;
- Pod projection failures hide shared-state updates without visible recovery.

## Runtime Portability

The Symphony skill should remain portable across runtimes.

In Codex, Claude Code, or similar local agent runtimes, Symphony works by having
agents read local control records, invoke available tools, and write status,
evidence, events, blockers, and proposed adjustments back to files. This is
agent-driven reconciliation.

In LinX, the same control records can eventually be projected into Pod/xpod as
authoritative state. Secretary, workers, app clients, and future controllers can
observe the shared state, invoke worker runtimes or tools, and write
status/evidence through the Pod model. This is state-driven reconciliation.

For workers, xpod is a portable tool surface over the same Pod authority the
runtime already holds. It is not a separate identity plane. A worker that has
been granted Pod access by LinX should be able to run xpod reads/writes through
that inherited session, while raw tokens and client secrets remain outside the
model-visible transcript.

LinX does not need these Pod/xpod control-plane operations for the portable
skill path. The Secretary/control-lane API for creating, splitting, closing, and
projecting control records is future product work tracked below.

The product model should not require LinX Pod/xpod to use the skill. LinX can
provide the strongest runtime profile without making Pod paths, RDF predicates,
URI templates, subscriptions, or xpod controllers part of the portable skill
contract.

## Declarative Runtime TODO

Future LinX Symphony should explore a Kubernetes-like declarative runtime:

```text
control record spec
  -> controller observes desired state
  -> worker/tool/runtime action
  -> status/evidence/events update
  -> next reconciliation
```

The main control lane should write the desired state and system semantics.
Workers and controllers should update observed state, evidence, events, and
blockers. This would let Symphony manage itself through the same control-record
model it asks workers to maintain.

Potential benefits:

- CLI, Web, Secretary, and workers can share one Pod-authoritative system state.
- Interrupted sessions can recover from `spec/status/evidence/events`.
- State becomes queryable, subscribable, auditable, and less dependent on chat
  transcript memory.
- Reconciliation can be idempotent and repeated until the observed state matches
  the intended state.
- Automation hooks such as schedulers, approval reconcilers, delivery
  reconcilers, and worker watchers become natural product features.

Potential risks:

- More schema, controller, event, and migration complexity than file-backed
  control records.
- Harder debugging when several controllers can update the same status.
- Eventual consistency and conflict handling across clients.
- Incorrect specs could trigger incorrect actions if controller authority is too
  broad.
- More precise permissions are required for who may write `spec`, `status`,
  `evidence`, and `events`.
- If the core skill becomes xpod-specific, Codex and Claude Code portability is
  lost.

Open design work:

- Define which Symphony product docs/control records are projected to Pod.
- Define the Secretary/control-lane API for LinX control-plane operations:
  create/update/split/supersede Spec, create/assign/cancel Work, record
  Evidence, and update Capability state.
- Define ownership rules for `spec`, `status`, `evidence`, and `events`.
- Define controller authority, approval boundaries, retries, and rollback.
- Define how file-backed portable records map to Pod-backed LinX records.
- Decide which first controller should prove the model without over-engineering
  the system.
- Define the exact shared model/repository for Agent container meta, optional
  Agent WebID relation, Skill resources, Skill bindings, runtime config
  override records, and Session/Run snapshot fields. The product shape is
  agreed; the remaining work is schema/repository/API implementation and
  migration.

## Wiki-Like Knowledge Means Managed System Knowledge

"Wiki-like" does not mean copying code into markdown. It means system knowledge
is addressable, maintainable, and usable by agents.

Useful knowledge objects include:

- Capability: a system ability and its user or operator semantics.
- Design: the intended behavior, boundaries, and tradeoffs.
- Implementation: where the design currently lives in code, config, models,
  docs, skills, or runtime behavior.
- Decision: why a direction was chosen and what alternatives were rejected.
- Spec: a planned system change.
- Work: active execution toward a spec or fix.
- Evidence: proof that the system did or did not change as intended.

These are product modeling concepts first. They do not require a separate
schema for every document on day one, but Symphony should behave as if these
objects exist and can be linked.

## Boundaries

Symphony should not:

- treat every chat message as an issue;
- treat every issue as work that must be split across agents;
- treat worker transcripts as product truth;
- dispatch workers from raw chat before updating the relevant control record;
- hide breaking changes inside generic status notes;
- replace backend runtime approvals;
- replace `auto`;
- invent RDF predicates, Pod paths, or storage templates inside prompts;
- preserve stale discussions as current truth without status or supersession.

Symphony should:

- bind new input to the right system object before creating work;
- preserve design intent and implementation status together;
- keep active work visible and steerable;
- represent breaking updates as compatibility impact plus migration/evidence,
  not as an ambiguous status;
- route execution to the right owner;
- require evidence before closing the loop;
- update the shared system situation after evidence lands.

## Relationship To Existing Docs

- `docs/secretary/auto-symphony-contract.md` defines `/auto` and `/symphony`
  product command semantics.
- `docs/agent-collaboration-model.md` defines Chat, Thread, Session, Issue,
  Task, Delivery, worker, and runtime collaboration boundaries.
- This document defines the higher-level Symphony control-plane purpose that
  those objects serve.
