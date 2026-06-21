# Login Identity / Storage / Routing Model

## Purpose

This is the source-of-truth document for LinX IDP/SP semantics: who owns
identity, who owns storage, how Cloud registration binds a WebID to a selected
SP, and how post-login writes choose their storage base.

Do not duplicate these rules in flow, launcher, or networking documents. Those
documents should link here when they need identity/storage behavior.

For Local canonical URL, tunnel, localhost/LAN, and access-route details, use
`docs/local-sp-domain-and-tunnel.md`. For runtime route probing and same-node
transport optimization, use `docs/multi-channel-access.md`.

## Terminology

Use these names consistently. The login bugs in this area mostly came from
calling different concepts "issuer" or "provider".

| Term | Meaning | Storage authority? |
| --- | --- | --- |
| Account authority | Where the human account/password and canonical Cloud WebID are managed. For Cloud and Local this is Cloud. | No |
| OIDC entry URL | The URL LinX gives to Inrupt `login({ oidcIssuer })` before discovery. For Cloud and Local+Cloud this is Cloud; for Standalone and Custom it is the selected same-origin provider. | No |
| OIDC issuer | The issuer returned by `/.well-known/openid-configuration` and used in tokens. The WebID profile must trust it through `solid:oidcIssuer`. | No |
| Storage Provider / SP | The selected data space that owns Pods and durable business writes. | Yes |
| Canonical SP URL | The stable public resource origin for the selected SP. | Yes |
| Access route | localhost, LAN, or tunnel transport for the same SP. | No |

Rules:
- Do not use `issuer` to mean account authority. `issuer` means the actual
  Solid/OIDC issuer used by discovery/token validation.
- In Local+Cloud, Cloud is both the account authority and the actual OIDC
  issuer. Pass Cloud to Inrupt as `oidcIssuer`; do not pass the Local SP root as
  `oidcIssuer`.
- `accountIssuerUrl` is UI/account metadata except in Local+Cloud, where it is
  also the actual OIDC issuer. It must never override `storageProviderUrl`.
- `provider` in the product UI means "space choice". Internally it must be
  split into account authority metadata, OIDC entry/issuer, and storage
  provider facts.

## Supported Product Routes

LinX currently exposes three product provider choices in the normal login
card: Cloud, Local, and Standalone. Local has two canonical URL ownership
strategies, but the login/storage semantics stay the same. Custom remains a
secondary route for third-party Solid providers; no route should force the
normal user through an IDP/SP two-step picker.

| Route | Account / WebID authority | OIDC entry / account surface | Storage Provider | Canonical SP URL |
| --- | --- | --- | --- | --- |
| Cloud | Cloud | Cloud | Cloud | Cloud SP provided |
| Local + Cloud-managed canonical domain | Cloud | Cloud OIDC/account surface with provision scope for the selected Local SP | Local xpod | Cloud-allocated `node-*.undefineds.co` |
| Local + user-managed canonical domain | Cloud | Cloud OIDC/account surface with provision scope for the selected Local SP | Local xpod | User-owned HTTPS origin |
| Standalone | Local xpod | Local xpod | Local xpod | Default localhost/LAN; optional user-owned URL |
| Custom | User-entered Solid provider | Same user-entered Solid provider | Same user-entered Solid provider | Same user-entered URL |

Rules:
- The normal login UX is a one-step product choice: Cloud, Local, or
  Standalone. Cloud means Cloud account + Cloud storage. Local means Cloud
  account + the current Local xpod/SP storage. Standalone means local account +
  local xpod storage.
- Local is always Cloud account authority + Local storage. It is not the
  local-account route; the local-account route is Standalone.
- In implementation terms, Local+Cloud starts from a selected Local SP/data
  space, but the OIDC discovery, authorization endpoint, token issuer, and
  Cloud WebID authority remain Cloud. The provision scope constrains Cloud's
  account/consent flow to the selected Local SP so the user never sees unscoped
  Cloud Pods from a Local entry.
- `issuer` is reserved for the actual Solid/OIDC issuer returned by discovery
  and used in tokens. Do not use `issuer` to mean "Cloud account authority" or
  "where the password database lives".
- With the Cloud-managed canonical domain strategy, Cloud allocates the
  canonical Local SP URL. LinX does not ask the user to type a
  platform-generated `node-*.undefineds.co` domain.
- Cloud-managed allocation is random but stable: the allocated domain is bound
  to the Local SP nodeId after registration, and later provision-code refreshes
  reuse that nodeId/domain instead of treating the domain as a user input.
- `node` and `device` are separate identities. `node` is the Storage Provider
  service node used for provisioning and canonical storage routing; `device` is
  a runtime-capable place that can run workspace sessions. Local workspace
  containers use `linx://<device-id>/...`; they must not reuse the SP nodeId.
- Historical Local registration is not an authority for selecting the current
  SP. It may provide renewal credentials (`nodeId`, `nodeToken`,
  `serviceToken`) only. The current authoritative SP domain comes from an
  explicit managed-domain configuration or from Cloud's current provision
  response / valid signed provision code.
- With the user-managed canonical domain strategy, the user provides a HTTPS
  origin that becomes the canonical Local SP URL.
- Local localhost/LAN addresses are access channels for the same Local SP; they
  are not identity URLs and must not be written into Cloud WebID profiles.
- `CSS_BASE_STORAGE_DOMAIN` is not a user-facing Local onboarding input.
- Custom is a combined third-party Solid provider route. The product asks for
  one URL only and internally mirrors that URL into issuer/storage fields for
  route invariants.
- Standalone is a separate product entry, not an internal fallback for Local.
  Local canonical URL failures must not silently downgrade into Standalone.
- If the Local canonical URL has no working external route yet, LinX may still
  start xpod and validate localhost/LAN reachability. It must not silently
  degrade the login to Standalone, Cloud, or write localhost/LAN into
  `solid:storage`.
- Adding a tunnel or self-managed route later must reuse the same local data
  directory and node configuration where possible.

## Local SP Visibility

Local SP visibility is scoped; LinX must not globally discover every storage
provider that happens to share the Cloud account authority.

Current MVP rule:
- The visible Local entry represents the currently provisioned local node/SP
  from LinX desktop/service state and its short-lived `provisionCode`.
- During provision-scoped login, consent/Pod selection must be filtered by the
  selected SP. If that scope is missing, expired, or cannot be resolved, the
  flow fails closed instead of showing Cloud Pods.
- Scoped lookup failure is not an empty Cloud/issuer account state. It is a
  Local binding failure. The UI must show Local retry/create-storage/back
  actions, never raw Cloud Pods or unscoped Cloud WebIDs.

Future cluster/invite rule:
- Additional Local/cluster spaces should appear only through durable
  membership/invite resources, not global account lookup.
- These resources should be modeled as Solid resources with URI relations, for
  example a Storage Provider resource, invite resource, membership resource,
  and optional cluster resource. They must reference people, nodes, and
  providers by URI rather than hidden `xxxId` links.
- A node owner sharing their Solid server with another account is a membership
  or invite operation. It is not equivalent to listing all Pods reachable from
  the same IDP.

## Layer 1 — Account / WebID Authority

**Owner:** Cloud / account authority (`id.undefineds.co`) for Cloud and Local routes; local xpod for Standalone.

Cloud is the canonical authority for Cloud and Local routes:
- account registration
- login
- canonical WebID semantics

Rules:
- Cloud/Local-route canonical identity is issued by Cloud.
- Local uses Cloud as the account authority, canonical WebID authority, and
  actual OIDC issuer. The OIDC entry given to Solid/Inrupt is Cloud. The
  selected Local SP is carried separately as provision/storage scope.
- The actual Solid/OIDC issuer returned by discovery must be trusted by the
  WebID profile through `solid:oidcIssuer`. In Local+Cloud this is Cloud, not
  the Local SP.
- `accountIssuerUrl` is metadata for account authority and UI copy. In
  Local+Cloud it is also the actual selected OIDC issuer and may be passed to
  Solid/Inrupt as `oidcIssuer`; it must not be conflated with the selected
  storage provider.
- Local still starts from a selected SP/data-space choice in LinX. Before
  starting OIDC, LinX must validate the selected Local SP entry and obtain
  a short-lived `provisionCode` for that SP.
- The Cloud account/consent flow receives the provision scope and must create or
  select only Pods bound to the selected SP. Opening an unscoped Cloud consent
  surface and then showing Cloud Pods is the regression this model forbids.
- LinX records Cloud as the account issuer and the Local SP URL as the storage
  provider for the remembered account.
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
- `solid:storage` is the durable binding from the Cloud WebID to the selected
  SP Pod. In Local routes it must point to the Local SP, not to the Cloud SP and
  not to localhost/LAN transport URLs.

## Registration / Onboarding Binding

Cloud-backed registration and existing-account binding must be scoped to a target SP.
The root of the SP is sufficient as the user-facing entrypoint:
`https://<sp-node-id>.nodes.undefineds.co/` may show onboarding, dashboard,
or redirect to the Cloud account flow.

The split Local flow is:

1. User selects or opens a Local SP.
2. The SP or LinX obtains a Cloud-recognized provision intent/code for that SP.
3. The browser opens the Cloud account/OIDC surface with that provision scope.
4. Cloud authenticates the user and creates or selects the Cloud WebID while
   keeping Pod choices scoped to the target SP.
5. The target SP creates/confirms the Pod under the selected SP.
6. The Cloud-backed account flow writes the WebID profile trust/storage binding:

```ttl
<https://id.undefineds.co/alice/profile/card#me>
  solid:oidcIssuer <https://id.undefineds.co/> ;
  solid:storage <https://<sp-node-id>.nodes.undefineds.co/alice/> .
```

Cloud must serve the SP-scoped consent/Pod selection for the selected Local SP.
It must not show unscoped Cloud Pods in a Local flow.

Security and product rules:
- Cloud must trust a short-lived signed provision intent/code or a registered
  SP relationship, not a raw `storageUrl` supplied by arbitrary front-end code.
- The same onboarding mechanism must be available from LinX, from the SP root
  URL, and from future third-party products. It must not be a LinX-private
  registration path.
- Consent/WebID/Pod selection in a split route must be scoped to the selected
  SP. If the scope is missing, expired, or cannot be resolved, the flow fails
  closed instead of showing Cloud Pods.
- A Local consent page must never substitute unscoped Cloud account WebIDs or
  Cloud Pods as a fallback. If the Local SP scoped lookup is unavailable,
  expired, empty, or errors, the only valid states are "create Local storage",
  "retry Local binding", or a blocking error.
- Existing Cloud accounts follow the same path: they do not re-register their
  identity; they bind or create a Pod under the selected SP and update
  `solid:storage`.
- Inrupt SDKs discover the result after login by reading `session.info.webId`
  and the WebID profile. They do not decide the storage provider by themselves.
- LinX `storedAccount` / remembered-account state is a UX convenience for the
  login card and "continue as..." action. It is not a storage authority and
  must not be required for post-login DB initialization. After login, the
  authoritative inputs are the current Inrupt session `webId/fetch`, the
  current pending login transaction when one exists, and the WebID profile's
  `solid:storage`.

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
- account authority and canonical Cloud WebID management
- profile trust/storage binding updates for approved SP-scoped provision flows
- canonical Cloud login / consent / token flow for the Cloud route
- stable WebID semantics
- provision-scoped registration/binding for Cloud account authority + external/Local SP
- WebID profile updates where `solid:storage` points at the selected SP

### SP/xpod must provide
- Pod creation and storage behavior
- candidate address set for the same node when available
- a root/onboarding entry that can produce or consume a Cloud-recognized
  provision intent
- SP-scoped provision and Pod lookup/create APIs for Local. Local+Cloud does
  not make the SP an OIDC token issuer.
- post-login or post-setup direct/tunnel upgrade path without changing the
  selected canonical SP URL
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
- In split Local routes, `webId` remains the Cloud WebID. `solid:oidcIssuer`
  must trust Cloud, which is the actual OIDC issuer. `podUrl`, bootstrap
  containers, resource IRIs, and all subsequent writes must stay under the
  Local SP.
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
- Split Local path: WebID may remain `https://id.undefineds.co/...`, and
  `solid:oidcIssuer` must trust Cloud, while Solid DB `podUrl`, `/.data/*`
  bootstrap containers, chat/message refs, Agent Home files, inbox
  approvals/audits, and runtime session refs must all resolve according to the
  selected Local SP. Built-in platform chat runtime calls must also target the
  Local SP runtime endpoint.
- Standalone path: local xpod starts before auth handoff,
  and both identity and data writes resolve under the local xpod SP.
- Network optimization may change the fetch transport to a proven same-node
  route, but canonical resource URIs and database Pod URL remain the selected
  SP, not the transient access route.
- For same-origin providers, a missing profile `solid:storage` binding or a
  current SP mismatch with profile `solid:storage` blocks entry rather than
  silently writing to a different provider.
- For Custom third-party providers, LinX only knows the single provider origin
  the user entered. It must verify that profile `solid:storage` exists and is
  inside that selected provider origin, but it must not assume the provider
  uses xpod's `/{webIdSlug}/` Pod path convention.
- Custom database initialization must use the actual profile `solid:storage`
  URL as the Pod URL. It must not derive a Pod URL from the WebID path unless
  the provider itself published that path as `solid:storage`.
- For split Local routes, the selected provider is the SP/data space and the
  Cloud WebID profile `solid:storage` must point at that SP. The
  provisioning/consent flow constrains which Pod can be selected, but it does
  not replace the profile/storage check. If profile `solid:storage` points at
  Cloud or an old Local node, or if the binding is missing, LinX must block
  entry.
- The post-login smoke test must write or simulate one business record after
  authentication and assert the produced URI starts with the selected SP Pod
  URL. A login that reaches `/chat` but writes the first message, approval,
  setting, or Secretary record under the IDP/WebID origin is a failure.
- Login may enter the chat UI as soon as the default AI Secretary contact/chat
  surface is staged. Pod persistence continues in the background, but the
  persisted Secretary Contact and Chat records must resolve under the selected
  SP before the bootstrap is considered healthy. The Secretary bootstrap must
  not block chat entry on a fixed default Thread or welcome Message; topics are
  created on demand with normal random Thread ids. Agent Home preparation is
  also asynchronous after chat entry, but when it runs it must use
  `/agents/__secretary__/` on the selected SP, including `AGENTS.md`, `.meta`,
  and `skills/README.md`.
- The same smoke test must exercise a later mutation path. At minimum one
  update/delete target must be proven to stay under the selected SP, and a stale
  Cloud-origin absolute IRI must fail closed in the split Local route.
- Regression coverage for any new Pod-backed feature must include a split
  Local case when the feature creates durable business data. The expected
  assertion is that the durable resource URI starts with the selected SP Pod URL
  while actor fields may still equal the Cloud WebID.
- Current regression coverage includes direct `chatOps` writes, ChatKit local
  store writes, Agent Home file creation, bootstrap container creation, inbox
  resolution writes, runtime sidecar approval/audit/session writes, exact
  update/delete SP guards, and platform runtime endpoint selection.

Consent / Pod selection invariant:
- For ordinary providers, the selected provider is both IDP and SP.
- For split Local, LinX still presents one provider choice to the user: the
  selected provider is the SP/data space, while Cloud is the account/WebID
  authority.
- The WebID/Pod choice shown during OIDC consent must be scoped to the selected
  SP. It must not offer a Cloud Pod when the current flow was started from Local
  SP.
- The current implementation achieves this by opening Cloud as the OIDC issuer
  and carrying `provisionCode` through the interaction. Cloud uses that scope to
  query/create only Local SP Pods for the Cloud account/WebID.
- If scoped lookup fails, the page must fail closed. It must not fall back to
  raw `pick-webid` results, account dashboard pod lists, profile-current WebID,
  or any Cloud account list.
- Existing Local Pod: show the matching Local SP WebID/Pod only.
- No matching Local Pod: show the Local first-Pod creation flow.
- Invalid/missing provision scope: show a Local binding error and a retry/back
  action, not Cloud Pods.
- After consent, the selected WebID profile must still carry `solid:storage`
  for the selected SP. Scoped consent is a candidate filter, not permission to
  ignore a missing, stale, or cross-SP storage binding.
- A future SP-hosted UI may act as an onboarding facade, but it must not make
  the Local SP the OIDC token issuer for Local+Cloud unless the whole product
  route is deliberately changed and the Cloud WebID `solid:oidcIssuer`
  contract is updated accordingly. Do not fake it with an API-server proxy or a
  front-end-only redirect.

OIDC discovery preflight invariant:
- LinX should not run its own browser-side `/.well-known/openid-configuration`
  preflight for normal non-strict HTTPS providers before calling Inrupt
  `login()`. Browser CORS on discovery is provider-owned, and Inrupt already
  performs the protocol discovery needed for OIDC login.
- LinX-owned discovery is reserved for strict local reachability cases:
  loopback Local, Standalone, and desktop-assisted canonical SP validation.
- Local+Cloud is non-strict from the browser perspective: the OIDC entry is
  Cloud, and the selected Local SP remains only the storage/provision target.

## Anti-goals
- LinX must not own username / WebID / Pod / consent semantics
- LinX may use a Cloud-allocated canonical Local SP domain, but must not imply
  that this is a platform-hosted forwarding service to arbitrary user domains
- SP must not become a second identity authority
- routing optimization must not mutate canonical WebID meaning
- the MVP must not claim automatic migration or seamless old-resource continuity across SP changes

## MVP Storage-Mismatch Policy

Current MVP scope is intentionally narrow:

1. If login resolves to the same current storage provider, continue normally.
2. If profile `solid:storage` is missing or points to a different SP, **block entry**.
3. For split Local, require both SP-scoped WebID/Pod selection during consent
   and a profile `solid:storage` binding that points at the selected Local SP.
   Also fail closed if the Solid DB Pod URL or first business write is not
   under the selected Local SP.
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
