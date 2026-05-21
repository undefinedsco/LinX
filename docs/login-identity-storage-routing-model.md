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

## Anti-goals
- LinX must not own username / WebID / Pod / consent semantics
- LinX must not provide or imply a platform-generated Local SP public domain
- SP must not become a second identity authority
- routing optimization must not mutate canonical WebID meaning
- the MVP must not claim automatic migration or seamless old-resource continuity across SP changes

## MVP Storage-Mismatch Policy

Current MVP scope is intentionally narrow:

1. If login resolves to the same current storage provider, continue normally.
2. If Cloud profile `solid:storage` exists and points to a different SP, **block entry**.
3. The user may then:
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
