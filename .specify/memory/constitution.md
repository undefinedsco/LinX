<!--
Sync Impact Report
Version change: 0.0.0 → 1.0.0
Modified principles:
- N/A → Solid Pod Privacy Sovereignty
- N/A → Web-Centric Multi-Platform Reach
- N/A → Next.js Static Delivery Core
- N/A → Drizzle-Solid Data Contracts
- N/A → Domain-Driven Minimal Validation
Added sections:
- Architecture & Platform Constraints
- Delivery Workflow
Removed sections:
- None
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ⚠ .specify/templates/commands (directory absent; confirm if guidance is needed)
Follow-up TODOs:
- None
-->
# Linq Constitution

## Core Principles

### Solid Pod Privacy Sovereignty
- All personal data MUST reside in user-controlled Solid Pods using W3C Solid protocols.
- Services MUST obtain explicit consent before copying data outside a pod and MUST delete temporary processing artefacts immediately after use.
- Transport and storage MUST remain end-to-end encrypted with revocable keys owned by the user.
Rationale: These controls uphold the privacy-first mandate and maintain trust in the Solid ecosystem.

### Web-Centric Multi-Platform Reach
- The web application MUST remain the canonical client and define authoritative user flows.
- Native experiences on Windows, Linux, macOS, iOS, Android, and 鸿蒙 MUST embed or package the web build without diverging business logic.
- Each platform wrapper MUST pass automated parity checks that compare behaviour against the web baseline before release.
Rationale: A single web core avoids fragmentation while keeping the product accessible on every target platform.

### Next.js Static Delivery Core
- Core business routes MUST be implemented as Next.js pages compatible with `next export`.
- Builds MUST generate static assets served from CDN-first infrastructure; any server rendering MUST be justified through governance review.
- Dynamic data MUST rely on incremental static regeneration or client-side fetching that honours Solid session boundaries.
Rationale: Static-first delivery guarantees deterministic deployments and simplifies scale planning.

### Drizzle-Solid Data Contracts
- Domain entities MUST be modelled in shared drizzle-solid schemas from which all CRUD operations are generated.
- Every data mutation MUST flow through typed drizzle-solid repositories bound to the active Solid session.
- Schema evolution MUST include migration scripts and pod compatibility notes before release approval.
Rationale: Centralised schema management keeps Solid data contracts consistent across clients and pods.

### Domain-Driven Minimal Validation
- Each domain aggregate MUST enforce its invariants internally; external layers MAY only perform basic data-shape checks.
- Validation outside the domain MUST log justification when a rule cannot be represented within the domain model.
- New capabilities MUST begin with ubiquitous language workshops that update the domain model ahead of UI or API coding.
Rationale: Domain-driven discipline keeps validation minimal and preserves the domain as the single source of truth.

## Architecture & Platform Constraints

- Deployments MUST target infrastructure that serves static Next.js exports behind HTTPS with CDN caching and Solid OIDC proxy support.
- Identity and authorization MUST use Solid OIDC flows; alternative auth stacks MAY NOT ship without governance approval.
- Platform-specific integrations (notifications, file access, offline storage) MUST abstract through cross-platform adapters that respect Solid data boundaries.

## Delivery Workflow

1. Begin every initiative with domain discovery and drizzle-solid schema design reviewed against Solid Pod contracts.
2. Implementation plans MUST document privacy impacts, static export strategy, and cross-platform verification steps before coding starts.
3. Release candidates MUST pass the web acceptance suite and parity checks on each supported platform wrapper prior to launch.

## Governance

- Amendments require approval from the privacy steward and platform architect, with decisions recorded in the repository governance log.
- Versioning policy: MAJOR for principle changes or removals, MINOR for new principles or governance sections, PATCH for clarifications without behavioural change.
- Quarterly compliance reviews MUST confirm adherence to Core Principles, architecture constraints, and drizzle-solid schema integrity.
- Release checklists MUST include verification against the latest constitution before deployment.

**Version**: 1.0.0 | **Ratified**: 2025-10-26 | **Last Amended**: 2025-10-26
