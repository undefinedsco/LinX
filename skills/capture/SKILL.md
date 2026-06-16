---
name: capture
description: Use when LinX Secretary should save, remember, collect, classify, or propose durable Pod memory from chat, files, URLs, fetched documents, or already-observed workspace/Pod content.
---

# Capture

Capture is LinX Secretary's product workflow for turning useful observed
content into durable user-owned Pod resources. It is not a raw Pod IO skill and
not a private memory bucket.

Use `linx_capture` for CaptureCandidate/CaptureEvent ledger records and
ApprovalRequest/InputRequest gates. Use `xpod-cli` for formal typed resource
writes when the final user-facing object itself must be created. Capture owns
the judgment: whether something is worth saving, what semantic type it should
become, where it belongs, and whether the user must approve or provide missing
information.

## Entry Points

### Explicit Capture

Use this path when the user says things like:

- "记住这个"
- "保存这个"
- "收藏这个链接"
- "放到这个项目的决策里"
- "这个以后作为证据"

If the user gives a clear type, location, and content, write the formal typed
resource directly, then call `linx_capture` with `direct_commit_event` to
record a `CaptureEvent`.

If the user asks to save but leaves type, location, or summary for Secretary to
infer, use optimistic capture: write the best formal resource when safe,
create/attach an `ApprovalRequest`, and call `linx_capture` with
`optimistic_commit_event`. The resource may appear in normal views with a
pending marker derived from Approval; Approval remains the authority state.

### Observed Capture

Use this path when Secretary notices important content while doing normal work
after read/find/fetch/search. This is passive. Do not perform extra scans only
for capture.

Observed capture creates a `CaptureCandidate` and `CaptureEvent` with decision
`candidate_created` through `linx_capture` operation `observed_candidate`,
unless an explicit user rule authorizes auto-promotion.

### Requested Scan

Use this path only when the user explicitly asks to scan/import a directory,
project, Pod area, URL set, or other source set. Requested scans normally
create a batch of `CaptureCandidate` records. Auto-promotion requires explicit
scope and approval.

## Classification

Classify by both semantic type and target location.

Semantic examples:

- `Idea`: uncommitted system/product direction.
- `Evidence`: proof, findings, logs, screenshots, patches, runtime artifacts.
- `Report`: closure, review, status, handoff, or quality summary.
- `Note`: general user memory or excerpt.
- `Decision`: durable decision.
- `Preference`, `Grant`, `AutomationRule`, `AgentConfig`: behavior-changing
  resources; pending versions may be visible but must not affect behavior.
- `Link` / `Favorite`: saved URLs or resources.
- `ContactInfo`: people-related facts.

Target examples:

- existing project, collection, folder, chat, thread, task, issue, run, or
  workspace;
- LinX system-owned capture areas for candidates/events;
- a proposed target that needs user input or approval.

Use this priority:

1. User explicitly specified type or location.
2. Current thread/task/workspace/project context.
3. Existing Pod project/collection/folder/resource patterns.
4. Learned user correction rules.
5. LinX system-owned capture area.
6. `CaptureCandidate` plus `InputRequest` when still ambiguous.

Do not impose a fixed LinX taxonomy when the user's Pod already has a relevant
folder, collection, project, or resource type.

## Structure Creation

Capture may create structure only under these authority levels:

- system-owned: `/.data/capture/candidates/`, `/.data/capture/events/`.
- user-directed: the user explicitly names the target structure.
- learned-rule: the user has previously confirmed the same scoped placement.
- AI-inferred: do not silently create user taxonomy; create a candidate,
  `InputRequest`, or `ApprovalRequest`.

## Approval and Input

Do not create a capture-specific approval state machine.

Use `ApprovalRequest` when authority is needed to:

- commit or promote a candidate;
- create user-facing folders/collections/resource types;
- rollback or delete an optimistic capture;
- enable a learned auto-promote rule;
- activate behavior-changing resources.

Use `InputRequest` when information is missing:

- type;
- location;
- title;
- merge target;
- requested scan/import scope.

`InboxNotification` is only the envelope. The authoritative state is the linked
`ApprovalRequest` or `InputRequest`.

`linx_capture` operations:

- `observed_candidate`: creates `CaptureCandidate` and
  `CaptureEvent(candidate_created)`.
- `direct_commit_event`: records a direct formal-resource commit after the
  formal resource was written.
- `optimistic_commit_event`: records an optimistic formal-resource commit linked
  to an `ApprovalRequest`.
- `ambiguous_input`: creates `CaptureCandidate`, `InputRequest`, and linked
  event when type/location/title is missing.
- `approval_request`: creates `CaptureCandidate`, `ApprovalRequest`, and linked
  event when AI-inferred structure or authority is required.
- `review_event`: records `promoted`, `rejected`, `corrected`, or `rollback`.

## Data Writing

Prefer model-backed resources through `@undefineds.co/models` descriptors. When
operating from a terminal/tool context, use `xpod obj` rather than hand-patching
modeled TTL.

Write:

- `CaptureCandidate` for uncertain observed content.
- `CaptureEvent` for every capture decision, correction, duplicate, rejection,
  rollback, or ignored item.
- Formal typed resources when the result is clear enough.

Do not inline long article/report/note bodies into TTL. Use file-primary
resources with metadata.

## Duplicate and Correction Rules

Before writing a formal resource, check whether the same source or target was
already captured. If duplicate, do not create another formal resource; record
`CaptureEvent(duplicate)` and ask about merge only if useful.

When the user corrects type, target, title, summary, or content, record
`CaptureEvent(corrected)` and treat it as a scoped classification hint for
future captures. Do not silently generalize corrections across unrelated Pod
areas.
