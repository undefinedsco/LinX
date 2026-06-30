# Pod Interaction Layering Spec

This document defines where LinX Pod interaction logic belongs. It exists to prevent Web, CLI, and Service from re-implementing the same Pod business rules in different shells.

For the product/storage narrative behind this layering, see
`docs/personal-linked-context.md`.

## Core Rule

Pod-facing code is split by responsibility, not by product surface.

- **Collections are UI/cache adapters.** They may exist in Web because they serve optimistic updates and reactive rendering.
- **Use-cases are explicit business actions.** They must not be inferred from collections and must not be duplicated per shell.
- **Models own shared resource semantics.** Resource identity, RDF relations, id/IRI helpers, repository semantics, and shared selection policies belong in `@undefineds.co/models`.
- **drizzle-solid owns generic Pod mechanics.** ORM-level id/IRI routing, exact record helpers, Pod base resolution, resource preparation, and generic write protection belong in `drizzle-solid`.
- **Service is an adapter, not the shared business layer.** Put logic in Service only when it requires daemon/runtime/filesystem/network authority.

## Terminology Contract

LinX product and application code uses **Resource** terminology for Pod data.

- Say `chatResource`, `messageResource`, `agentResource`, and `credentialResource`.
- Do not import or document shared Pod semantics through `chatTable`, `messageTable`, or other `*Table` aliases in Web, CLI, or Service code.
- `Table` is reserved for non-Pod meanings such as HTML tables, SQLite internals, or upstream drizzle-solid compatibility tests.
- If an older `@undefineds.co/models` release still exposes `*Table` aliases, treat them as compatibility-only and do not use them in new LinX code.

## Model-defined Semantic File System

Pod data should be treated as a model-defined semantic file system, not as a
choice between "database" and "files".

- **Modeled resources** hold queryable business facts: type, status, owner,
  project, thread, run, maker, tags, timestamps, document/source links, and
  relations to other resources.
- **File-primary artifacts** hold long bodies: Markdown docs, reports, logs,
  patches, transcripts, screenshots, benchmark outputs, and other human-editable
  or tool-generated artifacts.
- **Relations connect both layers.** `Issue.document`, `Idea.document`,
  `Report.document`, `Evidence.source`, and `schema:about`/domain-specific
  relations are the durable bridge between structured state and file bodies.

`@undefineds.co/models` should define which resources have document/source
relations, what those relations mean, which metadata is queryable, and the
default path policy for associated files. Product shells may let project/user
policy override file placement, but they must not invent storage paths or RDF
predicates ad hoc.

`drizzle-solid` should provide the generic convenience machinery required to
make this safe and ergonomic across products:

```ts
await db.dryRunResourceWithDocument(resource, input)
await db.upsertResourceWithDocument(resource, input)
await db.moveDocumentAndRelink(resource, input)
await db.deleteResourceWithDocument(resource, input)
```

The exact API names are not fixed by this document, but the responsibility is:
generic transactional/dry-run composition belongs in ORM/shared store tooling,
not in each Web/CLI/Service feature.

`.meta` is file/container-local metadata. It may record content type, checksum,
title, revision, or local file description. It is not the primary index for
business state. Do not require clients to discover Issues, Tasks, Runs, Reports,
or Evidence by recursively scanning scattered `.meta` files.

## Layer Map

```text
UI / Hooks / Components / CLI Commands / Service Routes
  ↓
Surface adapters
  - Web collections and optimistic cache
  - CLI yargs / TTY output
  - Service HTTP / daemon adapters
  ↓
Shared use-cases                         Resource collections
  ↓                                             ↓
Models repositories / resource helpers    Single-resource UI cache adapters
  ↓
Drizzle Solid ORM
  ↓
Solid Pod
```

Collections and use-cases are **siblings**. A collection is not a generated use-case layer.

## Collections

A collection is a frontend projection of one Pod resource.

Valid collection responsibilities:

- TanStack DB / React Query integration.
- Optimistic insert/update/delete.
- Subscription invalidation.
- UI cache state and local state patching.
- UI sorting, filtering, selection, and pending state.
- Mapping one resource to one reactive UI collection, for example:
  - `chatCollection -> chatResource`
  - `threadCollection -> threadResource`
  - `messageCollection -> messageResource`
  - `contactCollection -> contactResource`
  - `agentCollection -> agentResource`

Invalid collection responsibilities:

- Defining resource id rules.
- Constructing durable RDF subject paths by hand.
- Owning cross-resource business transactions.
- Owning Secretary bootstrap semantics.
- Owning Agent/Contact binding semantics.
- Owning Chat/Thread/Message write semantics beyond single-resource cache mutation.
- Owning Approval/Audit/Inbox projection semantics.
- Owning AI credential selection or provider rotation rules.
- Owning selected storage-provider / Pod-base routing rules.

A Web collection may call a shared use-case and then patch local collection state with the returned rows. The shared use-case must not import React, TanStack DB, or Web collection objects.

Example adapter shape:

```ts
const result = await ensureSecretary(db, input)

writeCollectionRow(agentCollection, result.agent)
writeCollectionRow(contactCollection, result.contact)
writeCollectionRow(chatCollection, result.chat)
queryClient.invalidateQueries({ queryKey: ['chats'] })
```

## Shared Use-cases

A shared use-case is an explicit business action that can be invoked by Web, CLI, Service, or workers.

Shared use-cases are required when an operation:

- Writes or reads multiple Pod resources.
- Has ordering or idempotency requirements.
- Encodes product semantics.
- Encodes permissions, risk, approval, or policy decisions.
- Projects runtime events into durable Pod records.
- Must behave identically across Web, CLI, Service, and TUI.

Examples that must be shared:

- `ensureSecretary`.
- `ensureAgentHome` semantics, with transport-specific file write adapters when needed.
- `createAgentContact` / `ensureAgentContact`.
- `createDirectChat` / `createGroupChat`.
- `createThread` / `appendMessage` / `touchThread`.
- `projectRuntimeEvent` into `Session`, `Approval`, `Audit`, and `InboxNotification`.
- `selectAIConfigCredential` and `markCredentialUsed`.
- Pod storage context normalization when the result affects writes.

Shared use-cases should accept explicit dependencies instead of reaching into shell globals:

```ts
await appendMessage({
  db,
  actor: webId,
  chat,
  thread,
  role: 'user',
  content,
  now,
  randomUUID,
})
```

They should return durable rows/IRIs and operation metadata. They should not update UI caches directly.

## Models Layer

`@undefineds.co/models` owns shared Pod semantics.

Belongs in models:

- Resource schemas and descriptors.
- RDF class and predicate choices.
- Resource id/default helpers.
- Resource IRI helpers that are specific to a shared resource.
- Repository methods for shared business lookup and mutation semantics.
- Relation helper semantics such as Chat/Thread/Message relationships.
- AI config credential/provider/model selection policy.
- Approval/InputRequest claim semantics.
- Resource-level helpers such as `agentResource.buildId(...)`, `threadRepository.idForChat(...)`, and equivalent shared helpers.

Does not belong in product shells if the resource is shared:

- Duplicated `agentResourceId` implementations.
- Duplicated base-relative id validators.
- Duplicated Chat/Thread/Message id construction.
- Duplicated Approval/Audit/Inbox path construction.
- Duplicated AI credential provider/model selection.
- Shared Turtle predicate definitions or serializers.

Migration note:

- If a shared helper is required by both Web and CLI but the currently released
  `@undefineds.co/models` package does not expose it yet, LinX may keep a
  temporary UI-free helper in a shared internal package such as
  `@linx/agent-runtime`.
- That temporary helper must be covered by contract tests and must not import
  React, TanStack DB, Electron, yargs, or Web-only code.
- The owning destination remains `@undefineds.co/models` for
  resource-specific semantics, or `drizzle-solid` for generic ORM mechanics.
  Do not let the temporary package become a second source of truth.

## ORM Layer

`drizzle-solid` owns generic Pod/ORM mechanics.

Belongs in drizzle-solid:

- Base-relative resource id validation and full IRI validation.
- Exact-record find/update/delete routing.
- Pod base resolution from database/session/dialect.
- Row-to-IRI and row-to-id resolution mechanics.
- Resource preparation and container creation strategy.
- Generic current-Pod write protection.
- TypeIndex/discovery/query mechanics.
- Adapter-level support for authenticated sessions and fetch transport.

Does not belong in drizzle-solid:

- LinX-specific Secretary semantics.
- Chat product behavior.
- Runtime approval policy.
- AI provider business policy.
- UI cache or CLI output behavior.

## Service Layer

Service owns capabilities that require a daemon or Node authority.

Valid Service responsibilities:

- HTTP API endpoints.
- Runtime process lifecycle.
- Local filesystem and Pod-container-to-filesystem mapping.
- Native daemon lifecycle.
- Tray integration.
- Local network, tunnel, and access-route probing.
- Secrets or credentials that must stay server-side.
- Adapting shared use-cases to HTTP JSON routes.

Invalid Service responsibilities:

- Being the only home for cross-shell Pod business rules.
- Defining shared resource ids, predicates, or path layouts.
- Re-implementing business semantics that CLI/Web also need.

If a rule must be shared by Web and CLI, prefer a shared package use-case over a Service-only endpoint. Service may call the same use-case.

## Surface Adapter Rules

### Web

Web may own:

- React components/hooks.
- Collections and optimistic UI state.
- Query invalidation.
- Visual error messages.
- Browser/Electron-specific login UI flow.

Web must not own shared Pod business semantics.

### CLI

CLI may own:

- yargs command modules.
- Terminal prompts and stdout/stderr rendering.
- Runtime subprocess adapters.
- Local archive/session file adapters.

CLI must not own a parallel version of shared Pod business semantics.

### Service

Service may own:

- HTTP route adapters.
- Node-only runtime and filesystem adapters.
- Local service health/status/launcher behavior.

Service must not become the sole shared business core.

## Placement Decisions

| Question | Layer |
| --- | --- |
| How should the UI update optimistically? | Web collection / hook |
| How should a CLI command render output? | CLI command adapter |
| Which Pod resources does this business action write? | Shared use-case |
| How are Chat/Thread/Message related? | models repository/schema |
| How is a resource id or IRI generated? | models if resource-specific; drizzle-solid if generic |
| How do we route `findById` vs `findByIri`? | drizzle-solid |
| How do we map a Pod container to a local filesystem path? | Service adapter |
| How does a runtime event become Approval/Audit/Inbox records? | Shared use-case, with surface adapters |
| How is an AI credential selected for a backend? | models repository/use-case |
| How does Web patch collection state after a shared use-case? | Web adapter |

## Current Known Cleanup Targets

These are known areas where current code does not fully match this spec:

1. `apps/web/src/lib/data/resource-identity.ts` and `apps/cli/src/lib/resource-identity.ts` duplicate id/agent helpers. Move shared identity helpers to the owning shared layer.
2. `apps/web/src/modules/chat/collections.ts` contains Secretary bootstrap, Chat/Thread/Message write semantics, and raw Solid reads. Move business use-cases out; keep collection cache updates in Web.
3. `apps/web/src/modules/chat/agent-home.ts` owns Agent Home file/meta semantics. Move durable semantics to shared use-case/model helpers; leave fetch/transport as adapter.
4. `apps/web/src/modules/chat/services/chatkit-local/runtime-sidecar.ts` and CLI auto-mode/pod persistence both project runtime events to sidecar resources. Replace with one shared projection use-case.
5. `apps/web/src/lib/data/pod-collection.ts` and `packages/stores/src/pod-collection.ts` are duplicate collection adapters. Keep collection behavior as frontend/cache infrastructure, but converge the implementation location.
6. Login storage reconciliation and selected-SP Pod context rules should be shared where they decide write targets; UI flow remains surface-specific.

## Non-goals

- Do not remove Web collections. They are valid frontend infrastructure.
- Do not force all Pod writes through the Service HTTP process.
- Do not make shared use-cases depend on React, TanStack DB, Electron, yargs, or browser globals.
- Do not move generic ORM mechanics into models.
- Do not move LinX product semantics into drizzle-solid.
