# Private / Group Reconciler Coordination Spec

Date: 2026-06-14

## Scope

This is the LinX-side coordination spec for single-human private surfaces and
multi-human group rooms. It aligns with the xpod/homeserver boundary in
`/Users/ganlu/develop/xpod/docs/reconciler-wake-runtime.md`.

This spec is about **runtime ownership and coordination**, not a new durable Pod
business model. Durable conversation state remains human-transaction oriented:

```text
Chat / Thread / Message / Run / RunStep
```

Reconciler coordination tells the runtime **who is allowed to decide whether an
Agent should be woken for a newly appended Thread event**.

## Terms

### Chat topology

Private/group is a product interpretation of the Chat surface:

- private: exactly one human authority; agents may still participate;
- group: more than one human authority, or a product surface explicitly created
  as a group room.

Do **not** model this as `Session.sessionType`, a new `Chat.type`, or any
second coordination-kind enum. `Session.sessionType` is a deprecated legacy
compatibility field and new code must not write it. `Session` is runtime
lifecycle projection. `Chat` and `Thread` are the durable transcript/work
surfaces.

When product code already knows the topology from participants, room creation,
addressability, or policy, it may pass those facts to the runtime. The runtime
must not infer durable topology from protocol accidents such as URL shape,
transport, or which UI opened the thread.

### Reconciler ownership

The runtime only needs the operational owner. Private/group remains a derived
product fact from human authorities and policy, not a second field passed around
as a durable type:

```ts
type ReconcilerOwner = 'client' | 'server'
```

Mapping rule:

```text
single-human/direct surface -> client Reconciler owner
multi-human/group surface    -> server-owned Reconciler
```

This owner is runtime coordination state. It is not a durable Pod business
resource and should not be written as a schema field on Session/Chat/Thread.

### External/API identifiers

External system ids are adapter facts, not Pod identities. Durable `id` fields
remain Pod resource ids. Opaque ids from ChatKit, Matrix, Responses, sidecars,
or other protocol surfaces should be stored under
`metadata.protocols.<apiNs>` unless the id is promoted by the shared models
contract for cross-client query, dedupe, audit, recovery, or stable protocol
correlation. Do not add `matrixRoomId`, `chatkitThreadId`, `responseId`, or
similar one-off fields to `Session`, `Chat`, `Thread`, or `Message` just because
an adapter needs round-trip state.

## Product rule

Keep the rule simple:

| Product surface | Human authority | Reconciler owner | Notes |
| --- | --- | --- | --- |
| Private AI chat | one human | `client` | CLI/desktop/native/foreground web may coordinate. |
| CLI automode | one human | `client` | Single-human control plane even when Secretary and workers participate. |
| Symphony | one human | `client` | Multi-agent orchestration, not multi-human group routing. |
| Review/control threads under one user | one human | `client` | Still owned by the same user's runtime control plane. |
| Multi-human group room | multiple humans | `server` | Server/homeserver decides which Agent(s) to wake. |

Default policy mapping in LinX:

```text
policy.kind === 'open_group' -> server-owned
humanAuthorityCount > 1      -> server-owned
all other current policies   -> client Reconciler owner
```

A future policy may override the owner explicitly, but the override must be a
clear product decision, not a protocol accident or a duplicate type alias.

## Why direct surfaces need client coordination

A single-human/private thread may be open in multiple clients at once: CLI,
desktop, web, and mobile. They all sync the same durable Thread, but they must
not all run Reconciler independently.

Without coordination:

1. multiple clients can observe the same user Message;
2. multiple clients can wake the same Agent;
3. duplicate assistant replies or conflicting Run state can be produced;
4. stale clients can resume after sleep and act on old context.

Therefore each client-owned Thread has at most one active client coordinator.

## Client-owned Reconciler lease

Client-owned coordination uses a small operational lease. It is not durable
conversation data and should not become a Pod business resource.

```ts
type ClientReconcilerLease = {
  thread: string
  ownerClientId: string
  ownerUser: string
  fencingToken: string
  expiresAt: string
}
```

Client capability/presence is also operational state:

```ts
type ClientCapability = {
  clientId: string
  kind: 'cli' | 'desktop' | 'mobile' | 'web'
  user: string
  canCoordinateClientOwned: boolean
  canRunAgent: boolean
  workspaceRefs: string[]
  heartbeatAt: string
}
```

Selection order:

```text
CLI / desktop > mobile/native > foreground web > no client
```

The current valid lease holder should remain active until heartbeat expiry or
voluntary release. A stale client must not reconcile if the lease has expired or
a newer fencing token exists.

In a standalone local CLI run, the host may omit lease enforcement. In a shared
multi-client setup, pass `requireClientReconcilerLease: true` and provide the
current `ClientReconcilerLease` before calling the Reconciler.

## Server-owned group coordination

Multi-human group rooms are server-coordinated.

Flow:

```text
Message appended to group Thread
  -> server/homeserver Reconciler observes it
  -> server decides zero, one, or many Agent(s) to wake
  -> Wake jobs are queued/deduped
  -> capable Agent Runtime consumes the wake
  -> assistant output appends back as normal Message
  -> clients sync/render
```

Clients may execute queued wakes when authorized, but they do not decide group
routing. This avoids duplicate decisions across users and devices.

Model-aligned routing signals come from shared Message fields:

- `Message.mentions` for mentioned Agents;
- `Message.routeTargetAgent` for an explicit one-shot target;
- `Thread.parent` for the Chat/Task surface containing the timeline.

Do not introduce protocol-specific roster fields or a parallel Thread-to-Chat
field as durable model fields. Participant membership should come from shared
relations such as `Chat.participants` pointing at Contact resources; the Contact
may then point at an Agent for execution capability.

## Wake job boundary

Cross-host wake jobs should stay minimal:

```ts
type SharedWakeAgentJob = {
  id: string
  thread: string
  triggerMessage: string
  agent: string
  reason: 'mention' | 'reconciler_decision' | 'manual'
  status: 'queued' | 'leased' | 'completed' | 'failed'
  createdAt: string
}
```

Dedupe key:

```text
(thread, triggerMessage, agent)
```

LinX runtime-local `WakeJob` may carry role, priority, notification, or control
fields for local scheduling, but those are host extensions. Shared dedupe must
not include provider, model, workspace, tool placement, or client id.

## LinX implementation boundary

The LinX `ThreadReconciler` should own:

- owner resolution from policy and explicit human-authority facts;
- direct-thread lease validation for client Reconciler execution;
- policy-specific wake selection;
- shared wake dedupe helpers;
- compact decision summaries for control records.

It should not own:

- durable Chat/Session schema for Reconciler ownership;
- server/homeserver storage implementation;
- provider/model selection;
- runtime workspace placement;
- ChatKit/Matrix-specific protocol models.

Current runtime policy defaults:

| `ThreadPolicyKind` | Default owner |
| --- | --- |
| `direct` | `client` |
| `auto` | `client` |
| `symphony` | `client` |
| `review` | `client` |
| `open_group` | `server` |

If product code passes multiple human authorities, server ownership wins unless
there is an explicit owner override.

## xpod / homeserver contract expectation

xpod/homeserver should expose enough operational facts for LinX to decide:

- whether the current surface is single-human or multi-human;
- who the current human authorities are, when known;
- current client capabilities/heartbeats for direct surfaces;
- current direct-thread Reconciler lease, when lease enforcement is enabled;
- server-side wake queue for server-owned group surfaces.

The homeserver may expose a small operational coordination surface for
direct threads, for example heartbeat/capability and lease acquisition. It
should not expose a large Reconciler business API and should not store a durable
`Reconciler` resource in the Pod.

## Non-goals

Do not add:

- durable `Reconciler` Pod resources;
- `Session.sessionType`, `Chat.type`, `chatKind`, or other durable type fields for this coordination decision (`Session.sessionType` is legacy/deprecated, not a new write path);
- protocol-specific data directories such as `/.data/matrix` for core chat
  state;
- Matrix/ChatKit-specific Reconciler models;
- agent-to-agent wakeup paths that bypass Thread events;
- provider/model/workspace/tool-placement fields on shared wake jobs.

Agent Runtime owns provider, model, tool, and workspace execution choices after
it consumes a wake.

## Acceptance checks

The implementation is aligned when:

1. `open_group` resolves to server-owned by default.
2. multiple human authorities resolve to server-owned without a durable type
   field.
3. direct, auto, Symphony, and review-style single-human policies resolve to
   client owner by default.
4. a client-owned Reconciler call with `requireClientReconcilerLease: true` and
   no valid lease skips wake creation.
5. a client-owned Reconciler call from the wrong client skips wake creation.
6. a client-owned Reconciler call from the lease owner may create wake jobs.
7. server-owned group coordination is not gated by client leases.
8. wake dedupe uses `(thread, triggerMessage, agent)`.
9. no durable Pod schema models Reconciler ownership as an app/protocol object
   or copies it into `Session.sessionType`/`Chat.type`/`chatKind` fields;
   existing `Session.sessionType` data is ignored or migration-only.
