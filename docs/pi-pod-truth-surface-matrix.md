# Pi + Pod Truth-Surface Matrix

This document captures the current truth ownership of the Pi/xpod alignment work.
It is the execution baseline for implementation, verification, and release claims.

## Boundary

- **Must be Pod-backed**: `chat`, `session`, `message`, `thread`, `approval`, `authorization/grant`, `audit`
- **Must remain local**: pure UI state only
- **Verified production claim requires**: CRUD against the real undefineds Pod, not only unit tests or local xpod.

## Matrix

| Surface | Current truth owner | Existing Solid resource/schema | Active writer(s) | Gap | Next action |
|---|---|---|---|---|---|
| chat | Pod-backed for CLI default TUI, legacy CLI chat, and auto-mode conversation data | `chatTable` | `apps/cli/src/lib/pi-adapter/pod-mirror.ts`, `apps/cli/src/lib/pod-chat-store.ts`, `apps/cli/src/lib/auto-mode/pod-persistence.ts` | Production CRUD must be verified against real Pod before release claim | Keep as authoritative conversation root |
| thread | Pod-backed for CLI default TUI, legacy CLI chat, and auto-mode conversation data | `threadTable` | `pod-mirror.ts`, `pod-chat-store.ts`, `auto-mode/pod-persistence.ts` | Production CRUD must be verified against real Pod before release claim | Keep as authoritative workspace/session thread |
| message | Pod-backed for CLI default TUI, legacy CLI chat, and auto-mode conversation data | `messageTable` | `pod-mirror.ts`, `pod-chat-store.ts`, `auto-mode/pod-persistence.ts` | Production CRUD must be verified against real Pod before release claim | Keep as authoritative message history |
| session | Pod-backed lifecycle projection for default TUI and web sidecar; live runtime control still uses Pi/runtime state | `sessionTable` | `pod-mirror.ts`, `apps/web/src/modules/chat/services/chatkit-local/runtime-sidecar.ts`, `apps/web/src/modules/chat/collections.ts` | Production CRUD must be verified; live transport state is not yet Pod-first | Keep Pod as durable session projection, local state only for live controls |
| approval | Pod-backed in real approval flows | `approvalResource`, `auditResource`, `inboxNotificationTable` | `apps/cli/src/lib/auto-mode/pod-approval.ts`, `apps/web/src/modules/chat/services/chatkit-local/runtime-sidecar.ts` | Default Pi ordinary tool calls do not create approval rows unless an approval request actually exists | Keep approval rows tied to real approval semantics |
| authorization / delegation | Pod-backed in remote approval grant flow | `grantResource` | `pod-approval.ts` writes `grantResource` for `accept_for_session` and reads active grants before creating new approvals | Broader Pi/web consumption still needs adoption; production CRUD must be verified | Keep grant as durable delegation policy |
| audit | Pod-backed for default TUI tool execution and approval decisions | `auditResource` | `pod-mirror.ts`, `pod-approval.ts`, web sidecar | Production CRUD must be verified against real Pod before release claim | Keep as append-only audit/event surface |

## Current architectural gap

The Pi cloud runtime path is still semantically thinner than full Pi runtime behavior:

- `apps/cli/src/lib/pi-adapter/runtime.ts`
- `apps/cli/src/lib/pi-adapter/stream.ts`

It can produce text/tool completions and mirror durable session/message/tool-audit state
to Pod, but live runtime control still prefers runtime API/Pi state over Pod truth.
Approval and grant rows are intentionally only created by real approval/delegation flows,
not fabricated from ordinary tool execution.

## Decision

Proceed with **Option A-prime**:

1. Harden `chat/thread/message` as explicit Pod truth
2. Implement the real `session` domain
3. Align approval / authorization with durable Pod-backed surfaces
4. Only then revisit transport normalization


## Naming rule

Use Solid/domain wording for shared storage semantics. Product-branded shared storage names such as `linxSchema` should not exist; new runtime/storage code should use `solidSchema` and describe resources as Solid resources rather than product-owned tables.

## Pod integration test target

The authoritative integration target for Pi/Pod/cloud alignment is **local xpod**, not a vanilla
Community Solid Server fixture.

Rules:

1. Keep schema contracts aligned with xpod capabilities. Do **not** remove or weaken production
   schema options such as `sparqlEndpoint` just because a generic CSS fixture does not expose the
   same `/.data/.../-/sparql` convention.
2. Local integration tests should exercise the same local xpod stack used by the product runtime:
   Solid auth, Pod storage, collection reads, and xpod SPARQL endpoints.
3. A vanilla self-hosted CSS helper may only be used as a narrow smoke fallback for basic LDP I/O
   during early development. It must not define production schema shape, naming, or query strategy.
4. If local xpod is unavailable, tests should fail with a clear environment/setup error or run an
   explicitly named smoke suite. They should not silently skip the Pod path and should not report a
   CSS-only smoke as full Pi/Pod integration coverage.
5. The required proof for implementation readiness is local xpod-backed round-trip behavior for
   `chat`, `thread`, `message`, `session`, `approval`, `authorization/grant`, and `audit` surfaces.
6. The required proof for release/user-facing completion is production Pod CRUD for the same
   surfaces, using a dedicated undefineds production smoke account. Do not run write smoke tests
   against a developer's personal WebID or a customer account.

Production write smoke scripts must fail closed unless the active WebID matches the explicit
`LINX_PROD_SMOKE_WEBID` environment variable. Use an isolated `HOME` or credential directory for
that account so local `~/.linx` state does not accidentally point production smoke at a personal Pod.

Implication: the earlier attempt to adapt schemas to vanilla CSS was the wrong direction. The fix is
to keep xpod semantics intact and make the test harness target local xpod.

## Exact lookup query shape

`findByIri(iri)` is an exact subject lookup. It should use SPARQL as an acceleration path when a
query capability exists, but the query must be subject-bound and bounded, for example
`SELECT ?p ?o WHERE { <iri> ?p ?o . }`, then map predicate/object rows through the table schema.

It must not reuse generic collection projection that expands every schema column into broad
`OPTIONAL` patterns. Collection/list queries may still project optional fields, but OPTIONAL
generation must be linear and bounded rather than nested or scan-heavy; otherwise production
CSS/Comunica can enter high-cost scans or hot loops on larger TTL/graph data.

LDP document reads are fallback behavior for missing/failed query capability, not the primary path
for large TTL resources.

## Approval lookup shape

Approval storage is date-bucketed, for example:

```text
/.data/approvals/{yyyy}/{MM}/{dd}.ttl#{approvalId}
```

This bucket layout is a storage/resource layout detail owned by `packages/models`. Runtime code must
not infer a different approval path in CLI/App shells.

There are two separate read paths:

1. **Known approval:** when an approval request has already produced an `approvalUri`, wait/resolve
   code must read that exact URI first. This is a subject lookup, not a list operation.
2. **Approval inbox/list:** App/Inbox surfaces may discover recent approvals by reading a bounded
   set of recent date-bucket documents. This is only a bounded listing strategy for user-visible
   pending queues; it must not become an unbounded recursive scan of `/.data/approvals/`.

Legacy rows that do not carry `approvalUri` may use a bounded list fallback during migration. New
rows must preserve `approvalUri` so remote approval resolution never depends on directory-wide list
semantics.

Approval rows also carry the user-decision UI contract when the upstream runtime provides it:

- `expiresAt` is the durable countdown deadline.
- `approvalOptions` is a JSON projection of the upstream native options, for example
  `allow_once`, `allow_always`, and `reject_once`.

AI secretary and App inbox surfaces should derive countdown and "approve once vs approve for
session" affordances from these fields, not from CLI-local state.

## Structured data access rule

For every surface in this matrix, if a schema/resource exists in `packages/models`, the default
application query path is:

```text
Solid auth -> Inrupt-compatible session -> drizzle-solid -> packages/models resource/repository
```

Client credentials and browser/OIDC consent may create that session differently, but after the
session boundary the query path must be the same. CLI/App shells should not parse shared RDF
documents directly to compensate for auth differences. If the shell only has an authenticated
`fetch`, adapt it to an inline session shape with `info.isLoggedIn`, `info.webId`, and `fetch`, then
use the same `drizzle-solid` path.
