# Login Identity / Storage / Routing Model

## Purpose

This document fixes the product and implementation boundary for Local login, Cloud identity, SP storage, and multi-address routing.

## Supported Product Routes

LinX currently exposes four deployment/login routes:

| Route | IDP | SP | SP public URL |
| --- | --- | --- | --- |
| Cloud | Cloud | Cloud | Cloud SP provided |
| Local base / LAN | Local first; Cloud route can be added later | Local | None by default; localhost/LAN |
| Local direct | Cloud | Local | User-provided |
| Local tunnel | Cloud | Local | User-provided public URL or tunnel domain |
| Standalone | Local | Local | None by default; optional user-provided |

Rules:
- LinX does not generate a Local SP domain such as `node-*.undefineds.co`.
- `CSS_BASE_STORAGE_DOMAIN` is not a user-facing Local onboarding input.
- Cloud IDP + Local SP requires a user-provided SP URL when the SP must be externally reachable.
- Local base / LAN starts the local xpod and guarantees localhost/LAN validation without public URL or tunnel.
- If the user has no public URL or tunnel domain, Local must still start for localhost/LAN use; it simply does not complete Cloud IDP + Local SP remote login until a public route is added.
- Adding a direct-public or tunnel route later must reuse the same local data directory and node configuration where possible.

## Layer 1 — Identity Authority

**Owner:** Cloud / IdP (`id.undefineds.co`) for Cloud and Local routes; local xpod for Standalone.

Cloud is the canonical authority for Cloud and Local routes:
- account registration
- login
- consent
- token issuance
- canonical WebID semantics

Rules:
- Cloud/Local-route canonical identity is issued by Cloud
- Standalone identity is issued by the local xpod and is intentionally separate from Cloud identity
- canonical WebID must remain stable across equivalent access paths
- switching LAN / FRP / public transport must not create a second identity model

## Layer 2 — Storage Authority

**Owner:** SP / xpod node

SP is the authority for:
- Pod storage location
- data persistence
- Pod reachability
- post-login tunnel/FRP upgrade
- local vs external storage access path

Rules:
- SP may change where/how data is reached
- SP must not redefine canonical identity
- storage upgrades must not invalidate existing data

## Layer 3 — Routing / Connectivity Optimization

**Owner:** LinX client (using SP-provided facts)

LinX is responsible for:
- reading candidate addresses from xpod/SP
- probing reachability / latency
- preferring LAN when safe
- silently falling back to FRP/public when LAN fails

Rules:
- LinX does not invent identity semantics
- LinX only optimizes transport choice between equivalent SP entrypoints
- LinX App/Web Runtime may rewrite canonical SP fetches to a proven same-node Local access route; user-facing provider/account state and canonical Pod URL remain unchanged

## Contract Summary

### Cloud must provide
- canonical login / consent / token flow
- stable WebID semantics

### SP/xpod must provide
- Pod creation and storage behavior
- candidate address set for the same node when available
- post-login or post-setup direct/tunnel upgrade path using the user's own public URL
- enough proof material to show multiple addresses belong to the same node

### LinX must provide
- Local startup shell UX
- inline startup status in the main login card
- launch/handoff into xpod auth flow
- candidate probing, ranking, and silent fallback inside LinX runtime
- storage mismatch detection and honest blocking copy in the MVP

## Data Write Acceptance

After login, LinX must treat the selected provider as the current SP/data space.
The authenticated WebID remains the actor identity, but it must not be used to
derive the business write base.

This is a release-blocking acceptance standard, not only an implementation
preference. A route is not considered logged in successfully until the first
business write after authentication is proven to land in the selected SP, and
all later business writes for the same session must continue to use that same
selected SP as their storage base.

Implementation invariant:
- `StoredAccount.storageProviderUrl` represents the selected Storage Provider/data space.
- `SolidDatabase.getDialect().getPodUrl()` is the only accepted base for LinX
  business resources (`/.data/*`, `/settings/*`, `/inbox/*`).
- WebID/Profile URLs may be fetched for identity display and mismatch checks,
  but LinX resource URI builders must not derive write locations from WebID.
- External identity/service references such as actor WebIDs, contact profile
  URLs, avatar URLs, or AI provider API URLs may point outside the selected SP;
  they are references, not storage authorities. Internal LinX business resource
  relations such as chat/thread/message/session/approval/audit/task/run/issue
  must stay under the selected SP when represented as absolute IRIs.
- If the current database has no Pod URL, business writes fail closed instead
  of silently writing to the WebID origin.
- If LinX has an explicit selected SP Pod URL for the login route, database
  initialization must verify that `SolidDatabase.getDialect().getPodUrl()`
  equals that selected SP Pod URL before exposing the database. If drizzle-solid
  or bootstrap code keeps or restores the WebID/IDP origin, login fails closed.
- In Cloud IDP + Local SP routes, `webId` and `solid:oidcIssuer` may stay under
  Cloud, but `podUrl`, bootstrap containers, resource IRIs, and all subsequent
  writes must stay under the Local SP.
- Create/update/delete paths share the same rule. No post-login writer may use
  `webId`, profile URL, issuer URL, or Cloud origin as a fallback storage base.
- If an update/delete receives an absolute resource IRI, that IRI must be inside
  the current `SolidDatabase.getDialect().getPodUrl()` prefix. A Cloud-origin
  IRI carried over from a previous session is stale for the current Local SP and
  must be rejected rather than mutated.
- Collection state and optimistic cache are not storage authorities. After a
  provider switch, rows loaded from a previous SP must not be reused as write
  targets for the new session.
- Platform runtime calls for built-in LinX/LinX Lite agents must resolve from
  the current SP Pod URL/origin first. They must not route through the Cloud
  WebID origin just because the actor WebID is issued by Cloud.

Acceptance:
- Cloud path: WebID, provider URL, Solid DB Pod URL, bootstrap containers, chat
  resources, inbox resources, runtime/session resources all resolve under Cloud
  SP.
- Cloud IDP + Local SP path: WebID may remain `https://id.undefineds.co/...`,
  but Solid DB `podUrl`, `/.data/*` bootstrap containers, chat/message refs,
  Agent Home files, inbox approvals/audits, and runtime session refs must all
  resolve under the Local SP Pod URL. Built-in platform chat runtime calls must
  also target the Local SP runtime endpoint.
- Standalone path: local xpod starts before auth handoff,
  and both identity and data writes resolve under the local xpod SP.
- Network optimization may change the fetch transport to a proven same-node
  route, but canonical resource URIs and database Pod URL remain the selected
  SP, not the transient access route.
- For same-origin providers, a missing profile `solid:storage` binding or a
  current SP mismatch with profile `solid:storage` blocks entry rather than
  silently writing to a different provider.
- For split Cloud IDP + Local SP routes, the selected provider is the SP/data
  space and the Cloud WebID profile `solid:storage` must point at that SP. The
  provisioning/consent flow constrains which Pod can be selected, but it does
  not replace the profile/storage check. If profile `solid:storage` points at
  Cloud or an old Local node, or if the binding is missing, LinX must block
  entry.
- The post-login smoke test must write or simulate one business record after
  authentication and assert the produced URI starts with the selected SP Pod
  URL. A login that reaches `/chat` but writes the first message, approval,
  setting, or Secretary record under the IDP/WebID origin is a failure.
- The same smoke test must exercise a later mutation path. At minimum one
  update/delete target must be proven to stay under the selected SP, and a stale
  Cloud-origin absolute IRI must fail closed in split Cloud IDP + Local SP mode.
- Regression coverage for any new Pod-backed feature must include a split
  Cloud IDP + Local SP case when the feature creates durable business data.
  The expected assertion is that the durable resource URI starts with the
  selected SP Pod URL while actor fields may still equal the Cloud WebID.
- Current regression coverage includes direct `chatOps` writes, ChatKit local
  store writes, Agent Home file creation, bootstrap container creation, inbox
  resolution writes, runtime sidecar approval/audit/session writes, exact
  update/delete SP guards, and platform runtime endpoint selection.

Consent / Pod selection invariant:
- For ordinary providers, the selected provider is both IDP and SP.
- For Cloud IDP + Local SP, LinX still presents one provider choice to the user:
  the selected provider is the SP/data space, while Cloud is only the identity
  issuer.
- The WebID/Pod choice shown during OIDC consent must be scoped to the selected
  SP. It must not offer a Cloud Pod when the current flow was started from Local
  SP.
- The current short-term implementation achieves this by carrying
  `provisionCode` into the Cloud OIDC interaction and requiring the picker to
  resolve WebIDs through the Local SP `/provision/webids` endpoint.
- After consent, the selected WebID profile must still carry `solid:storage`
  for the selected SP. Scoped consent is a candidate filter, not permission to
  ignore a missing, stale, or cross-SP storage binding.
- A future SP-hosted consent page is acceptable only if OIDC discovery,
  authorization endpoint, token issuer, and account session semantics remain
  coherent. Do not fake it with an API-server proxy or a front-end-only redirect.

## Anti-goals
- LinX must not own username / WebID / Pod / consent semantics
- LinX must not provide or imply a platform-generated Local SP public domain
- SP must not become a second identity authority
- routing optimization must not mutate canonical WebID meaning
- the MVP must not claim automatic migration or seamless old-resource continuity across SP changes

## MVP Storage-Mismatch Policy

Current MVP scope is intentionally narrow:

1. If login resolves to the same current storage provider, continue normally.
2. If profile `solid:storage` is missing or points to a different SP, **block entry**.
3. For split Cloud IDP + Local SP, require both SP-scoped WebID/Pod selection
   during consent and a profile `solid:storage` binding that points at the
   selected Local SP. Also fail closed if the Solid DB Pod URL or first business
   write is not under the selected Local SP.
4. The user may then:
   - go back and log into the correct space
   - create a **new Pod** in the current space

Explicitly deferred:
- storage migration
- background migration
- old-resource-link preservation
- dual-read / dual-write continuity

## Resource Identity Caveat

This architecture can keep **identity** stable better than it can keep **all resource IRIs** stable.

- Stable:
  - WebID / issuer semantics
  - current storage pointer discovery
- Not guaranteed stable today:
  - historical absolute resource IRIs already written against an old SP host

Reason:
- current xpod/LinX code still contains paths that derive Pod base from WebID host assumptions
- structured RDF storage still keys graphs/resources by full identifier paths

Therefore, the current model supports:
- stable identity on the IdP side
- current storage discovery on the SP side

But it does **not** yet support:
- transparent preservation of previously published absolute resource IRIs after SP changes

## Auto Route Selection Gate

Current implementation only enables automatic route selection after all of these are true:

1. xpod `/api/linx/capabilities` returns `contract=linx-local-onboarding/v1`.
2. The candidate route reports the same canonical `baseUrl` as the Local provider.
3. LinX keeps Solid DB `podUrl` canonical and rewrites only the network fetch target.
4. Browser fetch rewrite is enabled only when the transport does not downgrade an `https` canonical SP to plain `http` localhost/LAN.
5. xpod gateway preserves canonical Host / forwarded headers for DPoP verification.

This is intentionally scoped to LinX runtime. Plain third-party browsers still use the URL they actually open.
