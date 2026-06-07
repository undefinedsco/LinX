---
name: symphony
description: "LinX Symphony control-plane skill for system evolution: maintain control records, judge whether input changes existing design/work, coordinate Secretary/workers, and feed evidence back into system state."
---

# Symphony

Use this when LinX Symphony mode is enabled, when the user says `$symphony`, when
the Codex project prompt `/symphony` is invoked, or when a coding agent is
designing, implementing, or reviewing Symphony behavior.

This skill is the single Symphony skill. It covers portable control-plane
semantics and Codex control-lane behavior. It does not require LinX Pod/xpod and
does not implement product `/symphony`, Pod persistence, backend projection, or
storage templates.

`/symphony` is only a control switch. In product runtime, the objective comes
from a normal user chat message.

## Core Loop

Run this loop before creating work or dispatching workers:

```text
System Situation
  -> Evolution Judgment
  -> Execution Control
  -> Evidence Feedback
  -> updated System Situation
```

## Runtime Boundary

Portable runtimes such as Codex or Claude Code use local Markdown/JSON control
records plus available tools. LinX runtime must store shared control-plane facts
in its modeled Pod/RDF resources. In LinX product runtime, local files are only
runtime-private logs, no-Pod recovery material, or RDF/JSON-LD mirrors pulled
from Pod; they are not an independent Symphony business schema. Do not put Pod
paths, RDF predicates, URI templates, or LinX-specific synchronization mechanics
in this skill; they belong in LinX models/adapters, not as the core Symphony
skill contract.

LinX runtime may project the same control records into Pod/xpod as authoritative state
for shared state recovery and cross-client visibility, but that projection is an
implementation detail, not as the core Symphony skill contract.

The portable Symphony runtime contract is storage-agnostic. It may produce
control records, work splits, prompts, and reports, but it does not own Pod IO.
LinX product runtime persists through shared models/repositories. A portable AI
agent may call `xpod` CLI when that tool is available, but `xpod` is an adapter
tool surface, not something the core Symphony skill or runtime module requires.

In LinX Agent Runtime, Pod authority belongs to the runtime session and should
be inherited by tools launched inside that session. If a Secretary or worker has
Pod access, `xpod` commands it runs should use the runtime-provided authority
bridge, not a separate `xpod auth login` or stale app-local/legacy auth files.
Never ask the model to handle raw tokens, refresh tokens, client secrets,
cookies, or DPoP material directly.

## Agent Config And Skill Resources

Do not treat an agent's backend, model, credentials, tools, or skills as hidden
prompt blobs. They are managed resources with runtime snapshots.

In LinX runtime, an Agent is a resource/container. Its default runtime config is
metadata on that Agent container; skills are file or folder resources bound by
lightweight metadata. A Solid-backed implementation may use a container `.meta`
document to describe the Agent container itself, but Symphony code and prompts
must not hardcode those paths or predicates. Use shared models, repositories,
or xpod/adapters for the concrete storage shape.

Treat an Agent root as a context folder with multiple authority surfaces, not as
one merged config object. System-managed surfaces and user-managed surfaces live
under the same Agent folder. This is analogous to platform/system instructions
plus a repository `AGENTS.md`: both are loaded into runtime context, but they
remain separate sources of truth. Do not describe this as a field-level overlay
that rewrites the system package or user personalization into one blob.

The default Secretary Agent key is the system-reserved `__secretary__`.
The default Secretary Chat may use the same reserved key under the Chat
resource base, for example `/.data/chat/__secretary__/index.ttl#this`; this
does not make the Chat resource an Agent identity. Durable Agent, Skill,
maker/actor, grant-recipient, and runtime snapshot identity should use the
`/agents/__secretary__/` container resource. Do not treat `.meta` as the Agent
identity, and do not introduce non-reserved Secretary slugs.

Agent root and Agent identity are separate:

- The Agent root is the configuration/resource container.
- An Agent WebID is needed only when the AI acts as an auditable actor,
  requester, maker, grant recipient, credential holder, or authorization
  subject.
- Ordinary Skills, Issues, Tasks, Runs, Evidence, Reports, and files use their
  own resource URIs; they do not become WebIDs.

Skill content is file-backed. Skill metadata may record enabled state, version,
source, checksum, load policy, dependencies, and relations, but it must not
duplicate the full skill text in RDF or runtime config. Agent-scoped skill
resources are bindings/installations; external or reusable skills are referenced
through source/version/checksum/root and may be materialized locally per Agent.
Secretary and workers should refer to configured skill resources and loaded skill versions rather than
assuming a skill is just an invisible system-prompt section.

For the default Secretary, system-managed surfaces include the installed
Secretary package, built-in skill bindings, migration records, capability
envelope, and default policy pointers. User-managed surfaces include
`AGENTS.md`, preferences, user-installed skills, grants, memory policy, and
forked skill bindings. Upgrades may mutate system-managed surfaces only.
User-managed surfaces survive upgrades unless the user explicitly accepts a
migration or edits them. If a system skill is customized, represent it as a
user-managed fork or override binding with its own source/version/checksum.

Runtime startup resolves the Agent default config plus launch/session
overrides, projects the Agent folder in authority order, then freezes the
effective backend, model, credential source, skill set, loaded system package
version, user surface revisions, skill checksums, and authority/tool policy into
Session/Run metadata. Resume should use that snapshot by default. A different
backend/model/credential source means a new runtime session or an explicit
override record, not silent mutation of an old run's meaning.

## Control Lane

When Symphony is active in Codex:

- The main thread discusses requirements, system situation, design, steering,
  acceptance, and final reports with the user.
- The main thread updates the relevant control record before non-trivial
  implementation delegation.
- The main thread owns integration, review, closure, and evidence feedback.
- Implementation and test-writing should be delegated to bounded workers when a
  suitable worker surface is available.
- If no worker surface is available, simulate the mode locally and say that full
  delegation is unavailable.

## Control Records

Treat Symphony docs as control records, not essays. Keep them readable for
humans and stable enough for agents to bind work, compare state, and append
evidence without reconstructing truth from chat.

Useful headings:

- Status
- Scope
- Current Truth
- Active Work
- Release Boundary
- Compatibility Impact
- Evidence
- Open Questions
- Next Step
- Related Docs

Keep current truth separate from history. Put rejected alternatives, stale
notes, and superseded decisions under explicit headings.

Do not keep parallel truth copies. A repository document may summarize or link
to a control state, but the authoritative state field must live in exactly one
control record. If a local summary is needed for readability, label it as a
projection and include the source record and revision or timestamp.

Steering does not bypass the control record. When a new message changes active
work, update the relevant control record first, then deliver the resulting
delta to workers as a bounded steer, restart, cancellation, or follow-up. Do not
push raw chat into a worker as hidden scope change.

Steering deltas are navigation, not authority. Include the updated record path,
revision or timestamp when available, changed sections, superseded assumptions,
and required action. If scope, acceptance, release boundary, compatibility,
privacy, authority, or blocker rules changed, tell the worker to reread the
affected authoritative sections before continuing.

## State And Ownership

Distinguish these axes instead of collapsing everything into one status:

- system state: existing, partial, verified, known-broken, deprecated, stale, or
  superseded;
- work state: drafting, ready, running, blocked, reviewing, completed, failed,
  or cancelled;
- roadmap state: candidate, planned, deferred, rejected, or superseded;
- compatibility impact: compatible, behavior_change, breaking, or
  migration_required.

Every mutable state field needs a primary writer:

- User owns intent, authority, and final acceptance input.
- Secretary or main control lane owns System Situation, Evolution Judgment, Spec
  state, Work split/assignment, acceptance, compatibility impact, release
  boundary, and closure.
- Worker owns progress, observed implementation facts, feasibility findings,
  blockers, Implementation Change Requests, and evidence for assigned Work.
- Runtime/controller owns Run lifecycle and tool/runtime events.
- Reviewer/verifier owns findings and verification evidence.

Resource boundaries:

- Message is an immutable utterance or event, not automatically an Issue.
- Idea is a lightweight candidate extracted from one or more Messages. It is
  not a requirement, decision, Issue, or Task until promoted.
- Spec holds desired system change, rationale, non-goals, acceptance, and
  compatibility impact.
- Work/Task is a bounded execution slice.
- Run is one execution attempt.
- Delivery is a proposed result package, not accepted truth.
- Evidence is append-only proof or finding.
- ReleasePlan is a rolling publish boundary: what is safe to ship now, what
  remains open after release, and what evidence/status must be updated before
  publishing.

Chat, Run state, and Delivery have different jobs:

- Chat is the low-latency interaction channel between Secretary and a worker.
  It is for clarification, steering, small decisions, and work-in-progress
  coordination.
- Run state is the scheduler truth. When a worker asks for input, that Run is
  `waiting_input`; if Secretary cannot resolve it, the owning Task/Issue may
  become `blocked`. The system may continue other work instead of pretending
  the worker is still running.
- Delivery is the stage boundary. It packages proposed results, patches,
  artifacts, verification, risks, and final reports. It is not ordinary chat and
  not accepted truth by itself.
- Chat must not replace state. Any chat exchange that changes scope,
  acceptance, compatibility, release boundary, authority, or lifecycle state
  must be reflected in the control record.
- Delivery must not replace chat. Do not force every small clarification into a
  delivery packet when an interactive worker session is available.

If a role needs to change state it does not own, it writes a proposal, finding,
or Implementation Change Request instead of mutating the authoritative field.

Prevent split-brain documentation with field-level ownership:

- One mutable fact has one authoritative field and one primary writer.
- Workers may append execution facts, evidence, delivery notes, and scoped
  implementation documentation, but they do not close work or redefine
  acceptance by writing another document.
- Secretary/control lane merges worker facts into Issue/Spec/Task status only
  after checking evidence, current revision, and acceptance.
- Repo docs may explain implementation state, but they must not become a second
  task tracker. Link to the control record instead of duplicating lifecycle
  truth.

In LinX runtime, the MVP default is that workers do not directly access Pod.
Secretary/control lane gives workers a task brief or control-record snapshot,
and workers return progress, blockers, Evidence, Delivery reports, and
Implementation Change Requests for Secretary/control lane to persist. Direct
worker Pod read or restricted write is an explicit granted capability; when
granted, the write surface is still limited to execution facts such as
Run/RunStep, progress, blockers, Evidence, Delivery reports, and Implementation
Change Requests. Workers do not directly close Issues, change acceptance,
rewrite Spec truth, change roadmap/release boundaries, or create grants.
Structured Pod data must be read/written via shared models/ORM; do not invent
raw TTL patches or Pod paths inside the skill. LinX product projection should
expose this worker access policy on assigned Task/Delivery/Run/session metadata
so UI, Secretary, and runtime adapters enforce the same boundary instead of
relying on prompt text alone.

Pod and repository docs have different authority. In LinX runtime, Pod
Issue/Spec/Task records are the control authority for state, scope, acceptance,
split, ownership, closure, and cross-client coordination. Repository docs are
the implementation authority for code-adjacent design, behavior, tests,
examples, migration details, and file-level evidence. Repo work briefs or
implementation docs may link to Pod Issue/Spec/Task URIs, but they must not
become a second Issue truth. If implementation evidence contradicts the Pod
control record, workers write an Implementation Change Request and the control
lane updates Pod plus repo docs.

## Idea Capture

Use Idea as the buffer between fragmented conversation and committed system
work.

When Symphony is active, capture meaningful but uncommitted fragments as Ideas
when they describe a possible system direction, concern, product capability,
modeling principle, or improvement area. Do not capture ordinary chat, games,
or one-off explanations.

An Idea record should stay small and explicit:

- summary;
- source messages or source event references;
- affected area;
- status: captured, exploring, candidate, promoted, deferred, rejected, or
  superseded;
- commitment: thought, direction, tentative_decision, or committed;
- current understanding;
- open questions;
- related records;
- conflicts;
- next step.

Promotion gates:

- Promote Idea to Requirement Candidate only after the problem, area, value,
  current understanding, and open questions are explicit.
- Promote to Spec only after expected behavior, scope, compatibility impact,
  acceptance, and commitment are explicit.
- Promote to Work/Task only after implementation boundary, evidence plan, and
  blocker rules are explicit.

Symphony may automatically capture and merge Ideas, but it must not
automatically treat an Idea as committed product semantics or dispatchable work.
If commitment is unclear, keep it as `thought` or `candidate` and continue
discussion.

## Sufficiency And Escalation

Default to AI judgment inside the current control boundary. It is sufficient to
proceed without asking when the input binds to one active object, the acting role
owns the state being changed, acceptance/evidence can be derived from current
records, and the action is reversible or non-destructive.

Escalation is necessary only when missing information belongs to another owner
and cannot be safely inferred. Workers escalate to Secretary/control lane first.
The control lane asks the user only for user-owned intent, authority, privacy,
credentials, destructive permission, or final acceptance.

Do not ask the user to decide ordinary implementation details, routine evidence
choices, obvious duplicate binding, or release bookkeeping.

## Control Gates

Control gates are internal decision points. Users do not need to name them.
Secretary and workers must recognize them when normal execution cannot safely
continue on the current path.

Use the smallest sufficient gate set:

- `binding`: decide whether input is ordinary chat, an Idea, a new Issue, a bug,
  or a change to existing work.
- `change`: decide whether active scope, acceptance, compatibility, release
  boundary, or base revision has changed enough to rebase, steer, restart,
  cancel, split, or supersede work.
- `feasibility`: decide whether the assigned plan still can be implemented
  under current constraints. Workers may trigger this gate; Secretary/control
  lane resolves it.
- `authority`: decide whether user-owned authority, credentials, privacy,
  approval, grant, destructive permission, or external production access is
  required.
- `quality`: decide whether evidence is sufficient or the work needs fixes,
  review, retry, or more tests.
- `acceptance`: decide whether a Delivery can be accepted, rejected, partially
  accepted, reopened, or turned into follow-up work.

A gate is not a chat message, Delivery, or mode. Record it only when it changes
the control path: a control-record update, Run/Task status transition,
Implementation Change Request, Approval/InputRequest, Evidence, Report, or
Delivery decision. If it does not change execution or authority, keep it as
ordinary discussion or evidence.

Default ownership:

- Secretary/control lane resolves binding, change, feasibility, quality, and
  acceptance gates when current records and evidence are sufficient.
- Workers report feasibility, quality, blocker, and change signals; they do not
  resolve gates that alter scope, acceptance, authority, release boundary, or
  closure.
- The human user is asked only for gates that require user-owned intent,
  authority, privacy, credentials, destructive permission, or final acceptance.

## Evolution Judgment

For each meaningful user message or system event, bind it before turning it into
work:

- `ordinary_message`: conversation, explanation, game play, or casual chat. Keep
  it as Message; do not create an Issue.
- `new_concern`: new system concern or capability direction.
- `update_existing`: change to an existing capability, Spec, Issue, Task, or
  active execution.
- `steering`: correction while work is in progress.
- `bug_or_regression`: observed behavior conflicts with expected system state.
- `conflict`: request would break current product/system semantics.
- `duplicate`: already covered by open concern or active work.
- `defer`: should wait until active branch/spec lands.
- `ask`: binding, authority, target, visibility, or acceptance is ambiguous.

If a new requirement arrives while work is active, diff it against the active
record first:

- same intended outcome with narrower detail: update acceptance/context;
- changed intended outcome: steer or restart work when it changes the intended
  outcome;
- incompatible with current semantics: mark conflict or breaking impact;
- unrelated future direction: capture as roadmap candidate/deferred work;
- duplicate of existing work: link it and avoid dispatching a second task.

Then consider whether the ReleasePlan is still coherent. Symphony does not
manage AI work by human-style time boxes or work-hour estimates. AI can keep
working and release continuously, but each release checkpoint needs a clear
publish boundary, explicit evidence, and status feedback.

The release tradeoff is whether to keep working or close and publish the
verified part now. Consider how much more work remains, whether remaining work
is uncertain or risky, and whether completed work already satisfies an urgent
coherent need. Prefer closing a verified release and leaving the rest open when
the completed part is independently valuable.

## Execution Control

Create Issue/Task/Delivery/Session/Run objects only when they help control work.

Before dispatching workers for non-trivial work, ensure this chain exists or can
be represented:

```text
Spec -> Work -> Status -> Evidence
```

Workers should receive a stable control record or task brief to follow, not raw
conversation as scope. Each worker task needs one owner, one objective, concrete
acceptance, source context, workspace/resource boundaries, dependencies,
blocker conditions, and instructions to report blockers to Secretary/control
lane rather than asking the human user directly.

Every worker handoff must identify the source record and base revision. A
worker result based on an old revision is still useful evidence, but it must not
be merged directly into current control state until Secretary/control lane
rebases it against the latest record.

Symphony separates three spaces, but it does not force every space to split the
same way:

- Control space is shared. Secretary, workers, UI, and runtime adapters refer to
  the same Issue, Spec, Task, Delivery, Session, Run, and Evidence records.
- Runtime session topology is explicit. A worker may collaborate in the same
  conversation/work room as Secretary, or may run in a separate backend session
  reached by runtime input projection or control events. Do not assume one
  topology from the other.
- Workspace belongs to a Thread, not to an Agent. One independent Thread may
  have one worker and its own worktree. If three AIs are collaborating in the
  same Thread, they should normally share the same workspace so their edits,
  tests, and evidence are coherent. Different Threads may use separate
  worktrees when isolation or conflict control requires it.

Worker workspaces are environment-scoped. A worker's workspace is wherever that
worker runtime is executing: local shell, remote container, Codex, Claude Code,
CodeBuddy, cloud runner, or another runtime. Workers assigned to the same
Thread in the same environment should share the same workspace unless isolation
is explicitly required. The boundary is portability, not exclusivity: do not
assume Secretary, the user, or sibling workers in other environments can see the
same absolute path. Align cross-environment file work through control object
URIs, environment identity, workspace identity, repo-relative paths plus base
revision, checksums/etags, patch/artifact URIs, and evidence. Workers write in
their assigned workspace and report patches, artifacts, changed files, base
revision, and verification; the control lane decides how to apply or replay
results elsewhere.

Do not require fixed worker roles at the start. Use one bounded owner for one
coherent Work item by default. Role-based worker dispatch is a future LinX
runtime capability; when implemented, roles should be execution profiles
selected from contacts or created as AI contacts, and they bind to Work rather
than splitting Spec by themselves.

Interactive worker sessions do not need a Delivery tool for every blocker. When
Secretary launches or manages the worker session, the worker-facing `user`
input is a Secretary-controlled projection. If the worker lacks information,
authority, or a decision, it may ask in that conversation directly; Secretary
answers from the control record, updates the control record, steers the worker,
or escalates to the human user when the missing decision belongs to the user.
Delivery remains the channel for proposed result packages, async handoff,
artifacts, and final reports, not the required path for ordinary interactive
clarification.

Thread messages and LLM inputs are different layers. A Message records who said
what in a Thread. Backend `system/user/assistant/tool` inputs are runtime
projections derived from Thread facts and control records. If Secretary speaks
on behalf of the user, record Secretary as the maker/source in the Thread and
let the runtime adapter project that intent into the backend-required role.
Do not ask workers to fabricate user-authored chat messages just because the
backend protocol needs a `user` input.

Group coordination goes through Thread reconciliation, not direct member
wakeups:

- Chat is the long-lived groupable collaboration surface. Thread is the
  concrete observable work site under a Chat.
- Messages, control events, Delivery submissions, Inbox items, approvals, and
  schedule ticks are appended to a Thread first.
- A Reconciler observes Thread state, classifies and deduplicates events,
  applies Thread policy, and creates or skips WakeJobs.
- A Scheduler runs selected agent runtimes from WakeJobs. Agents append their
  outputs back to the Thread.
- Secretary is an in-Thread agent role, not the program controller. The
  Reconciler may wake Secretary; Secretary then performs semantic judgment.
- Worker tools may submit structured events such as `input.required`,
  `approval.required`, `worker.blocked`, `change.requested`, or
  `delivery.submitted`, but those events still go through Reconciler/Scheduler.
- `auto` and Symphony worker Threads use the same path: input, approval, or
  blocker events wake the same-Thread Secretary first; unresolved requests stay
  pending in Inbox/control state for the human or higher-level Secretary.
- Inbox is the ledger for input and approval lifecycle, including requests that
  Secretary resolved automatically.
- Delivery is a stage/result package, not generic message transport. Ordinary
  questions, answers, steering, and checkpoints remain Messages.
- Schedules are event sources. A schedule tick is appended to a stable schedule
  main Thread and may split a child execution Thread only when work is noisy,
  long-running, worker-owned, or needs separate review.

## Worker Protocol

Worker-facing minimum contract:

- Treat the worker-facing `user` input as Secretary-controlled unless the task
  brief explicitly says a human is speaking directly.
- Read the assigned control record or task brief before implementation.
- Keep ordinary clarification in chat with Secretary.
- When waiting on Secretary or user-owned authority, report the blocker and
  allow the Run to become `waiting_input`; unresolved work may move the Task or
  Issue to `blocked`.
- Use Delivery only for stage results, async handoff, artifacts, proposed
  patches, verification evidence, and final reports.
- Never use chat, Delivery, or repo docs to redefine scope, acceptance,
  compatibility, lifecycle state, or release boundary. Write an Implementation
  Change Request instead.

Workers must perform an implementation feasibility recheck before committing to
execution. This is where downstream work can discover that upstream judgment was
wrong, incomplete, or too broad.

If the plan cannot be fully implemented under the current control record, the
worker must not silently downgrade acceptance or ship a partial substitute.
Write an Implementation Change Request with:

- the failed upstream assumption;
- evidence from code, tests, logs, runtime behavior, or dependency inspection;
- what can be completed safely, if anything;
- recommended next shape: split, redesign, defer, spike/report, reduce scope, or
  request missing authority;
- the smallest coherent verified increment if partial progress is useful.

Workers may stop at the smallest coherent verified increment only when it still
satisfies current acceptance or the control lane has revised acceptance.
Otherwise the correct outcome is blocked/change-request, not incomplete work
presented as done.

Workers keep execution-facing documentation current while they work. They may
update progress, implementation notes within assigned scope, verification
evidence, blockers, risks, failed approaches, dependency waits, and proposed
adjustments. They must not silently update product semantics, acceptance,
compatibility impact, authority/privacy/visibility decisions, task scope,
ownership, or split strategy.

Worker documentation updates must be either append-only evidence or scoped
patches to the implementation surface they changed. If a needed documentation
change would alter scope, acceptance, compatibility, lifecycle state, or release
boundary, the worker writes an Implementation Change Request and waits for the
control lane to update the authoritative record.

## Worker Closure And Attempts

Do not collapse worker completion, integration, and release into one `done`
state. A worker thread is a work room and may be reopened or followed up later;
the terminal object is the current Run, Delivery, or Task decision.

Use this minimum lifecycle:

- `Run completed`: the worker runtime attempt ended without waiting on more
  input. This does not mean the task is accepted.
- `Delivery submitted`: the worker packaged a final report, patches/artifacts,
  verification evidence, risks, and remaining work.
- `Delivery accepted`: Secretary/control lane checked the Delivery against
  acceptance and recorded accepted, rejected, partially accepted, follow-up, or
  reopened.
- `integrated`: the accepted result has been merged, applied, or otherwise
  verified in the target workspace. If the worker already acted in the target
  workspace, record integration as verified rather than inventing a merge step.
- `released`: the integrated result entered a release boundary. Release is only
  required when acceptance explicitly includes publishing, packaging, deploy, or
  user-visible availability.

Worker closure is therefore:

```text
no active Run
+ latest Delivery is final
+ Secretary/control lane has recorded an acceptance/rejection/follow-up decision
```

Do not require release for every worker. Do require Secretary/control lane
acceptance before closing a Task as completed. User acceptance is required only
for user-owned intent, product semantic approval, destructive authority,
external production access, long-lived grants, or final release acceptance
unless an existing auto policy or grant covers it.

Repeated failed attempts must be recorded without creating duplicate Tasks.

- `RunStep` records each attempt fact: action tried, environment, command/tool,
  result, error summary, log/artifact pointer, and timestamp.
- `Evidence` records reusable findings distilled from attempts: failed
  approach, constraint, dependency behavior, blocker, or proof.
- `ImplementationChangeRequest` records the worker's conclusion that the
  current plan or acceptance cannot be completed as written.
- `Report` summarizes the attempt history, final result, unresolved risks, and
  recommended next action.

Use URI relations for traceability and duplicate avoidance, not filesystem
symlinks or transcript scanning. A next worker should be able to query relevant
findings before repeating work:

```text
RunStep -> run
RunStep -> task
RunStep -> delivery
Evidence -> sourceRunStep
Evidence -> subject
Evidence -> blocks / invalidates / supports / recommends
ImplementationChangeRequest -> basedOn Evidence[]
Report -> evidence[]
Delivery -> report
```

If a failed attempt exposed an independent product bug or future concern, link
or promote it through Idea/Issue binding. Otherwise keep it as RunStep/Evidence
under the current work so the system learns without multiplying issues.

## Evidence Feedback

Completion is not a worker saying "done". Accept completion only when evidence
satisfies the intended system change.

For non-trivial implementation, Design, Implementation, Tests, Examples, Docs,
and Evidence should describe the same capability semantics. Accepted work must
update the relevant control record status and evidence so future workers do not
need to reconstruct truth from transcript.

After execution, update:

- what changed;
- which control record changed and its new status;
- what remains open;
- what was confirmed or rejected;
- what is now stale or superseded;
- which follow-up should happen next.

## Measurement

Record observable events that let later agents judge whether Symphony worked:
input classification, control-record updates, dispatch/steering, worker
blockers, Implementation Change Requests, delivery acceptance/rejection,
release-boundary changes, reopened work, and missing evidence. Metrics events
must point to control records, runs, deliveries, and evidence; do not duplicate
raw transcripts, prompts, secrets, or private worker context into metrics.

## Hard Rules

- Do not treat every Symphony-mode chat message as an Issue.
- Do not treat `/symphony` slash arguments as an objective.
- Do not create work before binding the input to the relevant system object.
- Do not dispatch workers before updating the relevant control record enough for
  bounded execution.
- Do not steer active workers through unrecorded chat context.
- Do not treat breaking changes as ordinary status changes.
- Do not invent Pod paths, RDF predicates, URI templates, or shared model fields.
- Do not use runtime Session as Chat.
- Do not treat worker self-report as sufficient completion evidence.
- Do not read sibling worker transcripts unless Secretary includes them in a
  Delivery.

## Exit

If the user asks to leave Symphony mode, return to normal behavior. Do not keep
applying the control-lane rule across future turns unless Symphony is explicitly
active or the user asks to continue it.
