# Symphony Worker Goal Control Spec

## Status

This is the product/runtime spec for LinX-managed worker goals.

It records the agreed target after comparing the current CLI implementation with
the desired Secretary-controlled worker model. It is not a claim that every item
is already implemented.

Current baseline:

- CLI has an MVP path for Symphony worker dispatch, auto-mode goal sessions,
  approval/input interception, Codex app-server attach, local archives, and Pod
  projection.
- The shared `@linx/agent-runtime/symphony` layer owns the storage-agnostic
  worker lifecycle transitions for dispatch/start, runtime RunStep heartbeat,
  completion, Secretary acceptance, and follow-up extraction. CLI now calls
  these shared lifecycle helpers instead of hand-assembling those transitions.
- `@linx/stores/symphony-control` is the shared Pod control-state use-case
  for Contact / Chat / Thread / Message / Issue / Task / Delivery / Session /
  Run / RunStep row construction and writes, plus terminal Report/Evidence row
  construction for completed or failed workers. It also owns shared read
  use-cases for open Symphony Issues, running worker Sessions, and recent
  worker Reports. CLI projection/status and Web service both use this layer for
  the overlapping worker control records instead of maintaining separate
  lifecycle, timeline, or status projection semantics.
- Web has a non-collection Symphony control adapter that creates Web-sourced
  worker goal plans through the same shared plan use-case, can persist the
  shared control/timeline records through `@linx/stores/symphony-control`, and
  has collections for Issue / Task / Delivery / Session / Run / RunStep /
  Evidence / Report read/subscribe caches. Chat/Thread/Message/Contact use the
  existing Web chat/contact collections.
- `@linx/stores/symphony-control` can also map Codex/app-server or ACP-style
  runtime approval/input events into modeled `ApprovalRequest` /
  `InputRequest` / `InboxNotification` / `RunStep` rows with Secretary-first
  routing metadata. Web service exposes this shared use-case, and Web Inbox now
  reads `InputRequest` rows in addition to approval/audit notifications.
- Manual/external Codex workers can expose a structured `symphonyDelivery` JSON
  report. `@linx/agent-runtime/symphony` parses it as a normalized runtime
  result, and `@linx/stores/symphony-control` ingests it through the same
  shared worker completion path that writes RunStep / Delivery / Report /
  Evidence / follow-up Issue rows. This makes Delivery ingress a shared use-case,
  not a CLI-only archive format or a separate worker schema.
- LinX-launched Codex Symphony workers do not receive a LinX-specific Delivery
  env path. CLI ingestion reads the worker transcript/final report, while
  external Codex-plugin contexts can write portable Delivery files through MCP.
- Web now has a hosted-service runtime adapter for Web-started workers. It
  creates `/api/runtime/threads` sessions, starts the selected backend through
  the service runtime, streams SSE runtime events, and returns the same
  normalized `SymphonyRuntimeAdapterResult` consumed by the shared stores
  lifecycle use-case. Hosted runtime `auth_required` / `tool_call` events are
  routed through the shared `InputRequest` / `InboxNotification` persistence
  path before worker completion is accepted. The Web Chat right sidebar now includes a minimal Worker panel that reads the
  shared Pod control snapshot and starts workers through the Web Symphony
  service. The remaining product gap is UI polish/deeper worker detail views
  plus richer live raw Codex request-row wiring when the hosted runtime exposes
  exact Codex approval/input events beyond generic runtime events. The
  portable Symphony skill path, generated Codex plugin package, MCP Delivery
  helper, native hook event recorder, and structured Delivery fallback are
  present; Codex prompt discovery plus Delivery parsing/ingest/write and
  redacted hook JSONL recording are covered by tests.

## Scope

This spec covers:

- how Secretary launches and supervises worker goals;
- how Codex/ACP/app-server worker events enter LinX;
- how Secretary handles worker input and approval requests;
- what must be persisted in Pod for Web, CLI, TUI, and service to see the same
  state;
- what logic belongs in shared use-cases versus CLI/Web/service adapters;
- what is observable for LinX-launched workers versus external/manual Codex
  sessions.

This spec does not define new RDF predicates or storage paths. Durable shared
resource semantics belong in `@undefineds.co/models`; product shells must use
models/repositories instead of hand-written TTL or path contracts.

## Non-goals

- Do not replace Codex's native subagent scheduler.
- Do not make Symphony a separate product entry independent of Secretary.
- Do not invent a second Task/Run/Event schema for Symphony.
- Do not make Web collections the business layer.
- Do not require all Pod writes to go through a service HTTP endpoint.
- Do not force workers to read or write Pod directly by default.
- Do not create a standalone Workspace resource/table. A workspace is the
  selected execution container/location attached to a Thread/Session with
  metadata; git repository/worktree information follows that execution site.

## Product mental model

The user talks to Secretary. Secretary may create worker goals and manage worker
sessions.

```text
User
  -> Secretary Thread
    -> Issue / Task / Delivery / Session / Run records
      -> worker runtime session, e.g. Codex / Claude / CodeBuddy / LinX native
        -> runtime events / tool requests / final report
      <- Secretary reconciliation / acceptance / follow-up extraction
```

Secretary is the user's operating delegate, not a cloned agent per worker.
When Secretary speaks or acts on behalf of the user, the Pod maker remains
Secretary. Runtime adapters may project that action into the backend-required
`user` or `tool` role, but that projection must not rewrite the Pod actor.

## Resource boundaries

Use semantic resource relation names. Persist relations as resource references
named by the thing they point to, for example `chat`, `thread`, `message`,
`task`, `delivery`, `session`, `run`, `agent`, `workspace`. Do not persist
relation fields named `chatId`, `threadId`, `taskId`, or `threadUri` unless the
value is intentionally an opaque external/runtime identifier in namespaced
metadata.

| Resource | Meaning | Primary writer |
| --- | --- | --- |
| `Chat` | user-visible conversation/counterpart surface | Secretary/UI use-case |
| `Thread` | concrete timeline/work room under a Chat or Task | Secretary/UI use-case |
| `Issue` | user/product visible work item | Secretary/control lane |
| `Task` | bounded executable work unit | Secretary/control lane |
| `Delivery` | stage boundary or handoff envelope between control/runtime spaces | Secretary/control lane or runtime adapter |
| `Session` | backend/runtime lifecycle projection | runtime adapter |
| `Run` | one concrete execution attempt | runtime/controller |
| `RunStep` | append-only execution fact for a Run | runtime/controller |
| `Message` | user-visible utterance or semantic event projection | message use-case/runtime projector |
| `ApprovalRequest` / `InputRequest` | blocked authority/input point | runtime adapter, Secretary, Inbox use-case |
| `InboxNotification` | user-visible envelope for pending or resolved control work | Inbox use-case |
| `Evidence` / `Report` | reusable proof, findings, final worker package | worker/Secretary, persisted by control use-case |

Local JSON archives are recovery/log material. Pod resources are the product
authority for cross-client visibility and recovery.

## Control-plane layers

LinX needs one shared control-plane use-case layer. CLI, Web, TUI, service, and
MCP adapters call it; they do not reimplement it.

```text
Surface adapters
  - CLI commands / TTY rendering
  - Web components / collections / optimistic cache
  - Service routes / runtime process authority
  - MCP tools / portable agent ingress
  ↓
Shared control-plane use-cases
  - bind user input to Issue/Task
  - create or update Delivery/Session/Run
  - project runtime events into RunStep/Message/Inbox
  - resolve approval/input through Secretary policy
  - accept/reject/follow-up worker Delivery
  ↓
@undefineds.co/models repositories/resource helpers
  ↓
drizzle-solid ORM
  ↓
Solid Pod
```

Collections remain valid on Web, but only as cache/subscription/optimistic UI
adapters. They may call shared use-cases and patch returned rows into TanStack
DB. They must not decide durable resource ids, cross-resource transactions,
approval policy, worker lifecycle, or Pod write targets.

Service owns runtime/process/network/filesystem authority only. If a rule must
match CLI and Web, it belongs in a shared use-case or models repository, not in
a service-only endpoint.

## Worker goal lifecycle

A LinX-managed worker goal follows this lifecycle.

### 1. Bind and plan

Secretary receives a user objective or steering message and decides whether it
is ordinary chat, an update to existing work, a new Issue, a Task split, or a
blocker/decision.

Before dispatching a worker, Secretary must have enough control state for a
bounded task:

```text
Issue -> Task -> Delivery(task_dispatch) -> Session -> Run
```

The worker receives a task brief/control-record snapshot, not raw user chat.
The brief includes objective, acceptance, workspace, authority boundary, current
control record references, and where to report blockers/evidence.

### 2. Dispatch

Secretary creates a task-dispatch Delivery and routes it through Thread
Reconciler/Scheduler. The scheduler wakes the assigned worker runtime.

For Codex/ACP/app-server workers, the runtime adapter may have to project the
Delivery as backend `user` input. Pod still records Secretary/control lane as
the maker/source of that dispatch.

### 3. Run and observe

Runtime/controller starts or attaches to the backend process/session and records:

- process start/exit/error;
- backend session/thread id under protocol metadata;
- normalized runtime events;
- tool calls and tool results where available;
- blocked approval/input requests;
- periodic progress or heartbeat when the worker is long-running;
- final output/report package.

Durable product state should be updated incrementally:

- `Session` reflects lifecycle and backend session identity;
- `Run` reflects the current attempt state;
- `RunStep` records append-only execution facts;
- `Message` projects user-visible worker/Secretary conversation facts;
- `ApprovalRequest` / `InputRequest` / `InboxNotification` reflect blocked
  control points.

The existing local archive can remain the high-fidelity protocol log. It must
not be the only source Web/TUI can use for worker status.

### 4. Blocked input and approval

Worker-facing input is Secretary-controlled when Secretary launched or manages
the worker session.

```text
runtime input/approval request
  -> runtime adapter normalizes request
  -> shared control-plane use-case creates/updates request resource
  -> Thread Reconciler wakes Secretary or creates Inbox notification
  -> Secretary resolves if policy and context allow
  -> runtime adapter returns backend-required response
```

There are two distinct request kinds:

| Kind | Example | Secretary behavior |
| --- | --- | --- |
| approval decision | allow command, allow file write, grant permissions | decide within policy, otherwise ask user |
| structured/freeform input | commit message, migration name, issue answer | fill only when value is derivable and policy allows; otherwise ask user |

An input request is not the same as approval. When Secretary fills a value, the
record must include value source, decision source, and on-behalf-of semantics.
Sensitive values must not be echoed into chat or raw logs.

### 5. Delivery and reconciliation

Worker completion is not acceptance.

Minimum closure chain:

```text
Run completed or failed
  -> Delivery submitted with report/evidence/risks
  -> Secretary/control lane evaluates acceptance
  -> Task updated: completed / blocked / reopened / follow-up
  -> Issue updated only after current acceptance is actually satisfied
```

Secretary must run post-run reconciliation:

1. Did the worker satisfy current acceptance with evidence?
2. Did the work reveal follow-up issues, implementation change requests,
   reusable evidence, or product/modeling gaps?
3. Did the implementation create local glue that should be extracted into a
   reusable module, shared use-case, models helper, drizzle-solid capability,
   xpod API, or shared runtime utility?

Workers may propose follow-up, but Secretary/control lane owns classification
and Issue/Task lifecycle changes.

Reusable-module extraction is a required acceptance gate for non-trivial
worker deliveries. Secretary must inspect the changed files, repeated helper
patterns, test scaffolding, runtime adapters, and Pod/model access code. If the
same logic is likely to be needed by another surface or worker, Secretary must
record one of these outcomes before accepting the Delivery:

- `same_issue_task`: extraction is required before the current Issue can be
  considered complete;
- `new_issue`: extraction is valuable but independent of the delivered fix;
- `idea`: the reuse boundary is plausible but not yet scoped;
- `evidence_only`: the code is intentionally local, with a recorded reason.

Signals that should normally create or link an Issue:

- duplicated CLI/Web/service Pod write semantics;
- app-local id/IRI/resource construction that belongs in models or
  drizzle-solid;
- repeated runtime event normalization across Codex/ACP/ChatKit/Matrix or
  another backend;
- feature-specific helpers that are actually shared workflow/use-case logic;
- repeated test fixtures or fake runtimes that should become a shared harness;
- worker-discovered gaps in models, xpod, agent-runtime, or drizzle-solid APIs.

Secretary should not block an otherwise valid worker Delivery merely because a
reuse opportunity exists, unless acceptance explicitly required the extraction
or the local glue would make the current feature unsafe/inconsistent. It must
still create/link the follow-up Issue or record why no Issue is needed.

## Codex integration boundary

LinX may control Codex at the wrapper/adapter layer:

- start Codex through ACP or app-server;
- attach to a Codex app-server session;
- send task/steer/follow-up input;
- intercept approval/input requests exposed by the backend protocol;
- subscribe to normalized notifications;
- persist LinX control-plane records around the session.

LinX must not assume it can replace Codex's internal subagent scheduler or
change how Codex coordinates native subagents. Codex-native subagents remain an
implementation detail inside the backend unless their results are surfaced
through LinX adapters.

Observation levels:

| Worker origin | What LinX can reliably monitor |
| --- | --- |
| LinX-launched ACP/app-server worker | process lifecycle, backend session id, normalized events, approvals/inputs, local archive, Pod projection |
| LinX-attached Codex app-server | app-server requests/notifications, bridged approval/input, session archive, final Pod projection |
| manually launched external Codex | only artifacts or structured reports the user/agent exposes, unless a LinX MCP/hook/delivery bridge is installed |
| Codex native subagents inside a Codex session | only summarized/observable output surfaced by Codex, unless Codex exposes subagent lifecycle events through the adapter |

Portable Codex integration should prefer native Codex surfaces:

- Skills define behavior and report format.
- MCP tools are the Codex-side service surface. They may run the shared,
  storage-agnostic Thread Reconciler over Codex events and expose modeled LinX
  operations when available; they must stay as adapters/runners, not a second
  Symphony business implementation.
- Hooks may observe/enforce lifecycle/tool events where Codex supports them.
- A structured final envelope or Delivery file may be used as a fallback ingress,
  but it must be normalized by the same shared control-plane use-cases.

Do not create a separate Symphony-only AI tool schema that bypasses models.

## Main user input vs worker input

The main user conversation remains human-owned. AI must not forge human
UserMessages in the Secretary Thread.

Worker-facing input slots are different. When Secretary controls a worker, the
runtime adapter may project Secretary's runtime intent as backend `user` input,
because the backend protocol often only accepts `user/tool` roles. That
projection must preserve:

- real maker/source: Secretary Agent;
- `onBehalfOf`: user WebID when Secretary is acting under user authority;
- policy/grant/source record;
- target session/run;
- projection reason: dispatch, steer, delegated approval, delegated input, or
  follow-up.

User-visible chat should show that Secretary acted on behalf of the user without
leaking sensitive payloads.

## Workspace and execution environment

Workspace belongs to the Thread/Session execution context, not to Agent identity.
Agent Home carries long-lived rules/skills/backend defaults; workspace carries
where this piece of work executes.

Rules:

- Default Secretary work without a selected code project uses the user's Pod as
  authority center.
- Code work uses a folder/worktree execution site and may link repository
  metadata.
- Same-Thread workers in the same environment should normally share the same
  workspace.
- Independent Threads may use separate worktrees even when they point at the
  same repository.
- Git information follows the execution workspace/worktree, not Session policy
  and not Agent Home.
- Runtime adapters may use implementation locators such as local paths, `file:`,
  `pod:`, or device-local references, but durable Pod relations should point to
  modeled resources or containers with semantic relation names.

The product should distinguish storage-provider node from execution device, but
this spec does not introduce a durable Device resource. If a future shared
model needs one, it belongs in `@undefineds.co/models` and must not be invented
inside LinX shell code.

## Web/TUI read and subscribe requirements

Web and TUI must be able to observe the same Pod control state created by CLI.
A service-only sync endpoint is not the primary model; clients should subscribe
to modeled Pod resources where possible and use service streams only for live
runtime transport that is not yet persisted.

Minimum observable resources:

- Chat / Thread / Message for visible timelines;
- Contact / Agent for participants;
- Issue / Task for work state;
- Delivery for handoff/result stage boundaries;
- Session / Run / RunStep for runtime lifecycle and execution facts;
- ApprovalRequest / InputRequest / InboxNotification for blocked control points;
- Evidence / Report for verification and final package.

Required behavior:

- A worker started from CLI must become visible in Web after Pod subscription or
  refresh without a separate CLI-only status source.
- A worker started from Web must create the same Pod resources and be readable
  by CLI status commands.
- Subscription updates may be debounced and projected into collections, but
  they must not change business semantics.
- If Pod subscribe is unavailable, fallback polling may exist as transport
  resilience, not as a second model.

## Current implementation baseline

The following current LinX code already implements part of this spec:

- `apps/cli/src/lib/symphony/run.ts`: creates run plans, persists planned / running / completed / failed stages, dispatches workers through Thread Reconciler, calls auto-mode with `goalMode`, and emits delivery status events.
  For Codex workers it ingests the final report from the archived transcript
  after the worker exits.
- `apps/cli/src/lib/auto-mode/runner.ts`: launches ACP/native backends, archives stdout/stderr/normalized events, handles approval/input requests, and projects final conversations to Pod.
- `apps/cli/src/lib/codex-plugin/bridge.ts`: bridges Codex app-server approval/input requests through Thread Reconciler and Secretary/remote approval handling.
- `apps/cli/src/lib/codex-plugin/codex-native-proxy.ts`: starts Codex app-server, maps slash/runtime commands, subscribes notifications, and persists final records.
- `packages/stores/src/symphony-control.ts`: shared UI-free Pod control-state
  use-case for building and writing Contact/Chat/Thread/Message plus
  Issue/Task/Delivery/Session/Run/RunStep rows and terminal Report/Evidence
  rows. It also exposes a shared structured-Delivery ingress path for
  external/manual Codex worker reports. This is the shared business boundary
  used by Web and by the CLI projection adapter for overlapping worker control
  and timeline records.
- `apps/cli/src/lib/symphony/pod-projection.ts`: writes CLI-only surrounding
  projections such as Audit/report Inbox envelopes and delegates shared
  Contact/Chat/Thread/Message/Issue/Task/Delivery/Session/Run/RunStep/
  Evidence/Report rows and shared status/report reads to
  `@linx/stores/symphony-control`.
- `apps/web/src/modules/symphony/service.ts`: normalizes Web-sourced worker
  goal inputs and delegates plan persistence plus injected or hosted-service
  runtime-adapter lifecycle execution, runtime request persistence, and
  Web-observed structured Delivery ingestion to `@linx/stores/symphony-control`;
  collections remain read/cache adapters and now include Evidence/Report
  resources.
- `apps/web/src/modules/symphony/runtime-adapter.ts`: adapts Web-started
  Symphony workers to the hosted service runtime endpoints
  (`/api/runtime/threads`, start/message/SSE events), maps Symphony workspace
  metadata to runtime workspace inputs, routes hosted runtime input/tool
  requests into shared interaction persistence, and normalizes
  Codex/Claude/CodeBuddy runtime events into the shared
  `SymphonyRuntimeAdapter` result contract.
- `apps/web/src/modules/symphony/components/SymphonyWorkerPanel.tsx`: minimal
  Chat-right-sidebar UI for inspecting shared Pod worker status and starting a
  worker through the Web Symphony service. It does not own Pod row construction
  or lifecycle semantics.
- `packages/agent-runtime/src/reconciler.ts` and `thread-reconciler-controller.ts`: classify control events and schedule Secretary/worker wake jobs.
- `marketplace/plugins/linx-symphony/skills/symphony/SKILL.md`: portable Symphony control-lane behavior for
  Codex and other coding agents. It is intentionally storage-agnostic and
  points LinX product persistence back to shared models/use-cases.
- `marketplace/plugins/linx-capture/skills/capture/SKILL.md`: portable Capture
  behavior for deciding whether ordinary conversation contains durable context
  worth saving. Capture is independent from Symphony; Symphony may consume
  captured records discovered from user/project/agent policy, but it does not
  own the Capture plugin.
- `apps/cli/src/lib/codex-plugin/symphony-mcp.ts` and
  `apps/cli/scripts/pack-symphony-codex-plugin.mjs`: package the marketplace-owned
  Symphony skill as a coding-agent plugin with a `linx-symphony` MCP helper and root
  `hooks.json`. The helper exposes delivery status/validation/write tools only;
  the native hook recorder writes redacted JSONL lifecycle events only when
  `LINX_SYMPHONY_HOOK_EVENTS` is configured. Shared stores still own
  business-state ingestion and Pod writes.
- `docs/symphony-system-evolution-control-plane.md`: first-principles Symphony
  control-plane model used by the Symphony skill verification suite.

Open follow-ups outside the current Codex-support acceptance:

- Web-started workers can create/persist shared control and timeline records,
  run through an injected runtime-adapter boundary or the hosted-service
  runtime adapter, route hosted runtime `auth_required` / `tool_call` events into
  shared `InputRequest` / `InboxNotification` rows, and write terminal
  Report/Evidence rows through the shared stores use-case. Remaining product
  polish is complete worker UI and richer raw Codex approval/input request-row
  wiring when the hosted runtime exposes exact app-server/ACP request
  envelopes; this does not require a separate data model.
- Web can subscribe to Issue/Task/Delivery/Session/Run/RunStep/Evidence/Report
  resources. Chat right sidebar now has a minimal Worker panel for shared Pod
  snapshot inspection and worker start; richer worker detail/drill-down UI is
  still product polish rather than a separate data model.
- Portable Codex skill discovery, generated Codex plugin packaging, MCP Delivery
  parsing/validation/write, structured Delivery ingestion, and native hook event
  packaging are verified. Hook monitoring is intentionally an opt-in local
  event stream: it records redacted lifecycle metadata to
  `LINX_SYMPHONY_HOOK_EVENTS`, and never writes Pod business rows directly.
- External/manual Codex sessions are live-monitorable only when the LinX Codex
  plugin is installed and the hook event stream is configured, or when attached
  through the LinX bridge. Otherwise they can still submit terminal facts
  through the structured Delivery report.

## Implementation requirements

### Shared use-case extraction

Create shared, UI-free use-cases for these actions before duplicating behavior
in Web:

- bind objective to Issue/Task;
- create/update task-dispatch Delivery;
- start/attach worker Session/Run;
- append runtime RunStep;
- project runtime output to Message when user-visible;
- create/resolve ApprovalRequest and InputRequest;
- submit final Delivery/Report/Evidence;
- accept/reject/reopen/follow-up after worker completion;
- detect reusable-module extraction candidates during worker acceptance and
  create/link Issue/Task/Evidence outcomes;
- list running workers and recent reports from Pod.

The use-cases accept explicit dependencies: `db`, current actor, now/random,
runtime adapter, and policy resolver. They return rows/resources and operation
metadata. They must not import React, TanStack DB, Electron UI, yargs command
objects, or shell globals.

### Runtime adapter contract

Every backend adapter must normalize to the same events:

- `session.started`
- `session.resumed`
- `run.started`
- `run.step`
- `approval.required`
- `input.required`
- `worker.blocked`
- `delivery.submitted`
- `delivery.completed`
- `delivery.failed`
- `run.completed`
- `run.failed`

Backend-native fields stay under protocol metadata. Shared state transitions use
shared resource fields.

### Persistence cadence

- Stage transitions must be written immediately: planned, running, waiting,
  completed, failed, cancelled.
- Long-running workers must emit periodic `RunStep` progress or heartbeat when
  no semantic event occurred for the configured interval.
- Tool results and assistant deltas may stay in local archive unless they are
  needed for UI visibility, approval/input decisions, evidence, or recovery.
- Final report/evidence must be durable before closing the Task.

### Security and authority

- Workers are report-only by default with respect to Pod writes.
- Direct worker Pod read/write requires an explicit grant or runtime authority
  bridge.
- Workers may write execution facts only: RunStep, progress, blockers,
  Evidence, Delivery report, Implementation Change Request.
- Workers must not close Issues, rewrite acceptance/current truth, change work
  split, alter release/roadmap state, or create grants.
- Secretary may act for the user only inside an explicit policy/grant/risk
  boundary; otherwise it must create a user-visible pending request.

## Acceptance criteria

This spec is implemented when all of the following are true:

1. CLI and Web start worker goals through the same shared use-case layer.
2. A CLI-started Symphony worker appears in Web by reading/subscribing to Pod
   resources, including Issue/Task/Delivery/Session/Run status.
3. A Web-started worker is visible to CLI status commands from the same Pod
   facts.
4. Codex approval and structured/freeform input requests are normalized into
   shared request resources and routed to Secretary before the user is asked.
5. Secretary delegated approval/input records preserve maker, on-behalf-of,
   policy/source, value source, and target runtime session.
6. A long-running worker produces durable progress/heartbeat RunSteps without
   relying solely on local archive files.
7. Worker completion creates a final Delivery/Report/Evidence package and does
   not automatically close the Task until Secretary reconciliation accepts it.
8. Repeated failed attempts create RunStep/Evidence/Implementation Change
   Request records under the same Task instead of duplicate Tasks.
9. Secretary acceptance records the reusable-module extraction decision for
   non-trivial worker deliveries: same Issue task, new Issue, discovered
   capture record/modeling proposal, or evidence-only with reason.
10. Web collections remain cache/optimistic adapters and contain no duplicated
   Symphony lifecycle decisions.
11. Runtime adapter tests cover Codex ACP/app-server and at least one non-Codex
    backend through the same normalized event contract.

## Verification plan

Minimum tests before claiming completion:

- shared use-case unit tests for worker dispatch, approval/input routing, final
  delivery, post-run reconciliation, and reusable-module extraction
  classification;
- models/repository tests for resource id helpers and relation reads/writes;
- CLI integration test: `symphony run` dispatches a fake Codex worker, writes
  Issue/Task/Delivery/Session/Run/RunStep, and records final Delivery;
- Web integration test: seeded Pod control records update collections via
  subscribe or refresh;
- cross-surface test: CLI-created records are read by Web service/client logic
  without CLI-only archive access;
- Codex bridge test: app-server approval/input requests round-trip through
  Secretary and preserve delegated response metadata;
- failure test: worker exits non-zero, Task remains blocked/reopened, no
  duplicate Issue/Task is created;
- extraction test: a worker report with duplicated app-local helper logic
  causes Secretary reconciliation to create or link a reuse/extraction Issue;
- authority test: worker cannot mutate Issue acceptance/closure directly.

## Current verification evidence

The current implementation has automated coverage for the completed shared
boundaries:

- `packages/stores/test/symphony-control.test.ts` verifies shared
  Contact/Chat/Thread/Message/Issue/Task/Delivery/Session/Run/RunStep rows,
  terminal Report/Evidence rows, runtime
  ApprovalRequest/InputRequest/InboxNotification request rows, failed-attempt
  Implementation Change Requests represented as same-Task
  `Evidence(metadata.recordKind = "implementation_change_request")`, and
  modeled writes through `@linx/stores/symphony-control`. It also verifies the
  shared open-Issue, running-worker, and recent-Report readers used by CLI/Web
  status surfaces. The shared stores module also owns the UI-free
  injected-adapter worker runner used by Web and the structured Delivery ingress
  that turns a manual Codex report into the same RunStep/Delivery/Report/
  Evidence/follow-up Issue rows.
- `packages/agent-runtime/test/symphony.test.ts` verifies shared worker
  lifecycle use-cases, heartbeat RunSteps, Secretary acceptance/reuse
  extraction, and repeated failed attempts staying under the same Task with
  RunStep plus structured Implementation Change Request evidence instead of
  duplicate Tasks. It also verifies parsing of Codex-compatible final report and
  `symphonyDelivery` envelopes.
- `apps/cli/test/symphony-pod-projection.test.mjs` verifies CLI projection uses
  the shared control/timeline rows, writes terminal Report/Evidence rows, and
  that CLI status reads open Issues, running worker Sessions, recent Reports,
  and Web/shared-created Session rows through the shared Pod control-state
  readers rather than through CLI-only archives.
- `apps/cli/test/codex-plugin-bridge.test.mjs` verifies Codex app-server
  attach sessions map approval requests through remote approval handling and
  auto-enabled approval/input requests through Thread Reconciler and Secretary,
  including structured `item/tool/requestUserInput` answers projected back to
  Codex as `{ answers }`.
- `apps/web/src/modules/symphony/service.test.ts` verifies Web creates and
  persists worker control rows, Web-observed Codex runtime request rows, and
  Web-started worker lifecycle execution through an injected Codex runtime
  adapter boundary backed by the shared stores use-case. It also verifies
  Web-observed structured Codex delivery ingestion through the shared stores
  ingress.
- `apps/web/src/modules/symphony/runtime-adapter.test.ts` verifies the hosted
  Web runtime adapter creates/starts service runtime sessions, sends the worker
  prompt, consumes SSE runtime events, normalizes Codex delivery events into
  `SymphonyRuntimeAdapterResult`, routes hosted runtime input/tool requests
  through the shared interaction callback, maps folder/worktree/Pod-container
  workspace inputs, and exercises a non-Codex backend (`claude`) through the
  same event contract. `apps/web/src/modules/symphony/service.test.ts` also
  verifies the default hosted runtime adapter persists such requests as shared
  `InputRequest` / `InboxNotification` / `RunStep` rows.
- `apps/web/src/modules/symphony/components/SymphonyWorkerPanel.test.tsx`
  verifies the Chat sidebar Worker panel reads shared Pod snapshots and starts
  workers through the Web Symphony service instead of writing Pod rows in the
  component.
- `apps/cli/test/symphony-codex-mcp.test.mjs` verifies the portable Codex MCP
  helper responds to initialize/tools/list/tools/call, runs the shared
  Symphony Thread Reconciler over Codex events, and validates/writes a
  structured Delivery file without touching Pod business records.
- `apps/cli/test/symphony-codex-hook-events.test.mjs` verifies the native Codex
  hook recorder writes redacted JSONL lifecycle events when explicitly
  configured and no-ops without configuration.
- `apps/cli/test/symphony-codex-plugin-package.test.mjs` and
  `yarn verify:symphony-skills` verify the generated Codex plugin packages only
  the marketplace-owned `linx-symphony` skill entry, `.mcp.json` bridge, root
  `hooks.json`, and hook recorder script without creating a second skill source
  of truth, bundling `linx-capture`, or putting unsupported hook fields in
  `plugin.json`.
- `apps/web/src/modules/symphony/collections.test.ts` verifies Web collections
  are read/subscribe adapters for Issue/Task/Delivery/Session/Run/RunStep plus
  Evidence/Report and do not encode lifecycle decisions.
- `apps/web/src/modules/inbox/collections.test.ts` covers existing approval
  resolution behavior while Inbox now initializes and reads `InputRequest`
  resources as first-class pending input items.
- `yarn verify:symphony-skills` verifies the marketplace-owned `plugins/linx-symphony`
  metadata, the dual-role control-record scenarios, and Codex prompt discovery
  for the single Symphony skill entry point.
- `yarn verify:symphony-dual-role` verifies the reusable dual-role fixture suite
  for documentation-first control records, state axes, authority ambiguity,
  steering, duplicate/deferred concerns, and post-worker evidence feedback.


## Migration sequence

1. Keep the current CLI MVP working.
2. Extract shared use-cases from CLI modules without changing Pod semantics.
   The first extracted boundary is `@linx/stores/symphony-control` for
   Contact/Chat/Thread/Message/Issue/Task/Delivery/Session/Run/RunStep
   control-state/timeline rows and terminal Report/Evidence rows.
3. Replace Web-specific lifecycle logic with calls to shared use-cases while
   keeping Web collections for cache and optimistic updates. The Web service
   now creates and persists minimal worker control rows through the shared
   stores use-case.
4. Add Pod subscriptions/read models for Issue/Task/Delivery/Session/Run/RunStep/Evidence/Report.
5. Add shared `ApprovalRequest` / `InputRequest` / `InboxNotification` request
   row construction for runtime approval/input events. Web can persist these
   rows through the shared use-case, and Inbox can read input requests.
6. Wire live Web/CLI runtime adapters to call the shared request persistence
   path for Codex ACP/app-server events. CLI bridge, Web-observed request persistence, and hosted Web runtime generic
   `auth_required` / `tool_call` request-row wiring are covered; exact raw
   Codex app-server/ACP request semantics still depend on the runtime event
   surface exposing those envelopes.
7. Add incremental RunStep/heartbeat persistence for long-running workers.
8. Package portable Codex integration through skills/MCP/hooks. Structured
   Delivery ingress and the generated skill+MCP+hook package are normalized into
   the same shared use-cases. Hook events are opt-in, redacted, local JSONL
   monitoring facts; they are not a second Pod control model.
9. Remove CLI-only status dependencies once Pod read paths are complete. CLI
   open-Issue, running-worker, and recent-report status reads now delegate to
   `@linx/stores/symphony-control`; remaining status work is product UI/adapter
   wiring, not a separate CLI business source.
