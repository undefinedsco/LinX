# Capture Design

Date: 2026-06-16

## Purpose

Capture is the Secretary capability that turns useful content observed during normal work into durable Pod resources. It is not a generic xpod-cli command and it is not a new private memory bucket. LinX decides whether and how to capture; shared resource semantics live in `@undefineds.co/models`; xpod/drizzle-solid execute Pod reads and writes.

## Core Principles

- Pod is the authority for durable user memory and control state.
- Capture decisions are made by Secretary skills, not by xpod-cli.
- Capture writes typed resources first when the target semantic type is clear.
- Capture does not own an approval state machine. User authority gates use `ApprovalRequest`; missing information gates use `InputRequest`.
- File-like resources remain file-primary with queryable metadata, not long content in TTL.
- Capture may use already-observed context and lightweight indexes by default; it must not silently scan the user Pod or workspace.
- Capture can create durable structure, but only under explicit user intent, learned rules, or LinX system-owned areas.

## Entry Points

### Explicit Capture

The user explicitly asks Secretary to remember, save, collect, or place something:

- “记住这个”
- “收藏这个链接”
- “保存到 LinX 项目的设计决策里”
- “这个以后作为证据”

If the type, target, and content are specific enough, Secretary writes a formal resource directly and records a `CaptureEvent`.

### Observed Capture

Secretary may notice important content while doing normal work after a read/find/fetch/search operation. This is passive. Secretary must not perform extra scanning purely for capture. Observed capture creates a `CaptureCandidate` unless user rules explicitly authorize automatic promotion.

### Requested Scan

The user may explicitly request scanning a directory, project, Pod area, or source set. Requested scan is an explicit task. Results default to a batch of `CaptureCandidate` records unless the user grants auto-promote rules.

## Capture Outcomes

```text
explicit + specific         -> formal resource + CaptureEvent(direct_commit)
explicit but underspecified -> formal resource + ApprovalRequest + CaptureEvent(optimistic_commit)
observed important          -> CaptureCandidate + CaptureEvent(candidate_created)
requested scan              -> batch CaptureCandidate unless auto-promote is authorized
ignored/duplicate           -> CaptureEvent(ignored|duplicate), no duplicate formal resource
```

`pending_review` is not a capture-owned lifecycle. If the UI needs a pending badge on a formal resource, it is a projection from a linked `ApprovalRequest`. The authoritative pending/approved/rejected status lives on the control resource.

## Resource Model

### CaptureCandidate

A temporary candidate, not formal memory.

Useful fields:

- `source`: message, file, URL, fetched document, or resource IRI.
- `summary`: concise statement of what might be worth saving.
- `suggestedType`: proposed formal resource class such as Note, Idea, Evidence, Decision, Preference, Link, or ContactInfo.
- `suggestedTarget`: proposed folder, collection, project, task, issue, chat, or other scope.
- `confidence`: high, medium, or low.
- `reason`: short rationale for why it might be worth capturing.
- `thread`, `task`, `run`, or `workspace` links when relevant.

Long source bodies are not inlined in TTL. Store them as source files or link to the existing Pod resource.

### CaptureEvent

Append-only ledger for capture decisions and corrections.

Useful fields:

- `source`: original message/file/url/resource.
- `actor`: Secretary, user, or worker.
- `decision`: direct_commit, optimistic_commit, candidate_created, promoted, rejected, corrected, rollback, duplicate, ignored.
- `targetResource`: formal resource or candidate affected by the event.
- `suggestedType` and `suggestedTarget`.
- `confidence` and `reason`.
- `approval` or `inputRequest` link when a control resource is involved.
- `userCorrection` when the user changes type, target, title, summary, or content.

### Formal Resources

Capture writes into existing typed resources where possible:

- `Idea` for uncommitted system/product direction.
- `Evidence` for proof, findings, logs, screenshots, patches, or runtime artifacts.
- `Report` for closure/review/status/handoff/quality summaries.
- `Note` or equivalent knowledge resource for general user memory.
- `Decision` for durable decisions.
- `Preference`, `AutomationRule`, `Grant`, or `AgentConfig` only when confirmed; pending versions may be visible but must not affect behavior.
- `Link` or `Favorite` for saved URLs/resources.
- `ContactInfo` or contact notes for people-related facts.

If a resource body reads like an article, excerpt, report, decision, or long note, it should be file-primary: body in a Pod file and metadata in TTL.

## Pod Context Map

Capture classifies against the user’s existing Pod instead of imposing a LinX taxonomy. The context map may include:

- folders and containers already observed during the current task;
- known model-backed resources and descriptors;
- existing collections/projects/topics recently used;
- current chat/thread/task/issue/run/workspace;
- user-corrected classification rules;
- explicitly requested scan results.

Default capture must not traverse the whole Pod or workspace. It may use lightweight model indexes and already-known context. Full scans require user instruction.

## Classification Priority

Secretary chooses semantic type and storage target in this order:

1. User explicitly specified type or location.
2. Current thread/task/workspace/project context.
3. Existing Pod project/collection/folder/resource patterns.
4. Learned user correction rules.
5. LinX system-owned capture area.
6. `CaptureCandidate` plus `InputRequest` when still ambiguous.

Semantic type and storage target are separate decisions. A resource may be a `Decision` whose file lives under a project decision folder, or an `Evidence` attached to a task/run with its artifact stored as a file.

## Structure Creation Rules

Capture may create structure under four authority levels:

| Level | May create? | Examples |
| --- | --- | --- |
| system-owned | yes | `/.data/capture/candidates/`, `/.data/capture/events/` |
| user-directed | yes | user says “save this under project X decisions” |
| learned-rule | yes, explainable | user repeatedly confirmed similar placement |
| AI-inferred | no silent creation | create candidate or request approval/input |

Creating or changing durable user organization from AI inference requires `ApprovalRequest` or `InputRequest`.

## Approval and Input Integration

Use `ApprovalRequest` when the system needs authority to execute an action:

- commit/promote a candidate;
- create user-facing folders/collections/resource types;
- rollback or delete an optimistic capture;
- enable a learned auto-promote rule;
- activate behavior-changing resources such as Preference, Grant, AutomationRule, AgentConfig, or RoutingRule.

Use `InputRequest` when the system lacks information:

- which type fits best;
- where it belongs;
- what title to use;
- whether to merge with an existing resource;
- what scope a scan/import should cover.

`InboxNotification` remains only the ActivityStreams envelope pointing at the authoritative control resource via `as:object`.

## Optimistic Capture and Rollback

When user intent is clear but details are inferred, Secretary may write a formal resource optimistically and link it to an `ApprovalRequest`. The resource appears in normal views with a pending marker derived from the Approval. If rejected, the rollback policy is one of:

- delete the formal resource;
- move it to trash/archive;
- mark it rejected when audit retention is needed.

Every rollback creates a `CaptureEvent(rollback|rejected)`.

## Deduplication and Learning

Before writing, capture should check for:

- same source already captured;
- highly similar summary/content in the target scope;
- same target resource already linked to a capture event.

Duplicates do not create new formal resources. They record `CaptureEvent(duplicate)` and may ask the user whether to merge.

User corrections are recorded as `CaptureEvent(corrected)` and become classification hints for future captures. Learned rules must be explainable and scoped; they must not silently generalize across unrelated Pod areas.

## Component Boundaries

```text
Secretary capture skill
  decides whether to capture, classifies type/target, explains decisions

@undefineds.co/models
  owns CaptureCandidate, CaptureEvent, shared predicates, descriptors, repositories,
  and links to ApprovalRequest/InputRequest/formal resources

drizzle-solid
  owns resource/id/IRI mechanics and typed Pod persistence

xpod-cli
  executes user-visible Pod IO and model-backed object commands
  does not decide capture semantics

Reconciler/Inbox
  notifies clients about ApprovalRequest/InputRequest changes and lets one claimant handle them
```

Product shells must not duplicate shared RDF predicates, id defaults, or lifecycle semantics.

## First-Version Scope

Build:

- `capture` Secretary skill documentation and prompt contract.
- `CaptureCandidate` and `CaptureEvent` shared models.
- repository helpers for creating candidates/events and resolving duplicate source captures.
- CLI/runtime bridge that exposes capture guidance to Secretary and persists model-backed capture records.
- Approval/Input integration for optimistic capture and ambiguous classification.
- focused tests for model schema, repository behavior, and CLI projection behavior.

Do not build:

- background whole-Pod scanning;
- silent creation of user taxonomy from one-off inference;
- a private LinX-only capture bucket for all memory;
- a capture-owned approval state machine;
- xpod-cli semantic classification logic.

## Acceptance Tests

1. Explicit capture with a concrete target creates a formal resource and `CaptureEvent`, without a candidate.
2. Explicit capture without enough target detail creates a formal resource linked to `ApprovalRequest`; normal views can show it as pending via the Approval projection.
3. Observed important content creates `CaptureCandidate` and `CaptureEvent(candidate_created)` only.
4. AI-inferred new user directory creation does not happen silently; it creates `ApprovalRequest` or `InputRequest`.
5. User rejection rolls back or marks the optimistic resource and records `CaptureEvent(rejected|rollback)`.
6. User correction records `CaptureEvent(corrected)` and subsequent similar captures can use the correction as a scoped rule.
7. Duplicate capture does not write duplicate formal resources; it records `CaptureEvent(duplicate)`.
