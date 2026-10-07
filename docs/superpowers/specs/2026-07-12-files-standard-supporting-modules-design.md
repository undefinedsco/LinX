# Files-Standard Supporting Modules Design

## Scope

Refactor `model-services`, `contacts`, and `settings` to the module template already enforced by Files. This is an ownership and behavior refactor, not a directory-only migration. Existing public imports remain compatible through root facades while production composition moves to explicit owners.

## Layer Contract

Each module uses the same five layers:

- `domain/`: framework-free types, normalization, projections, validation, and display models. It cannot import React, Zustand, Collection, router, desktop APIs, or module UI.
- `data/`: Collection/repository access, authenticated reads, HTTP/Desktop bridges, persistence waiting, cross-resource compensation, and query invalidation. It may import domain rules but cannot render or read Zustand.
- `features/`: workflow controllers and business-aware composition. It owns user-facing pending/error state, editable-draft recovery, subscriptions, routing intents, and assembling pure UI.
- `ui/`: reusable props-only visual components. It cannot import module store, data, feature controllers, router state, Pod adapters, or desktop APIs.
- `app/`: module-level Zustand UI state, layout bridges, and application composition. A thin feature renderer may be the shell entry when an extra app wrapper adds no ownership.

Root `components/`, `collections.ts`, `store.ts`, and existing entry files are compatibility facades only. New production code must import the canonical owner path.

## Model Services

- Provider/model/credential rows remain authoritative in TanStack DB Collections.
- Provider definitions and view projections move to `domain/`; provider icons and image assets remain UI metadata rather than durable model facts.
- `data/` owns collection initialization, mutation plans, persistence waiting, and remote model discovery.
- Feature controllers await every mutation. Success UI is emitted only after persistence; failures remain visible and restore the editable draft.
- The UI must not claim encrypted Pod storage until encryption exists. Current credential wording describes private Pod storage without making a cryptographic promise.
- Provider list rows use native button/listbox semantics and keyboard selection.

## Contacts

- Contact and agent Collections remain durable authority; Zustand keeps only selected id, filters, and dialog state.
- Contact and Agent resources have exactly one Web Collection instance owned by Contacts data. Chat may use those instances through an explicit adapter but must not redeclare the same resource Collections.
- Contact classification, sections, labels, initials, group metadata, and detail projections move to `domain/`.
- `data/` owns collection initialization and cross-resource contact/group/chat operations.
- List and detail feature controllers expose explicit loading, error, empty, refresh, save, and rollback states. Query errors must never render as an empty contact list.
- Pure UI owns list rows, filters, member rows, selectable contacts, detail sections, and dialogs. All selectable rows are keyboard reachable and expose selection semantics.
- The existing detail monolith is split by workflow: detail projection, profile synchronization, group membership, agent editing, and deletion/navigation.

## Settings

- Settings navigation and display projections live in `domain/`; Zustand stores only the active section.
- `data/` owns browser setup HTTP calls, Electron bridge calls, and local onboarding access. Feature controllers may compose existing read-only update/runtime hooks from their canonical shared owners instead of duplicating those snapshots inside Settings data.
- Features own setup, runtime management, updates, theme, and local network workflows.
- Initial setup shows storage/runtime essentials first. Domain, certificate, public IP, tunnel provider, and tunnel token are behind an explicit advanced disclosure.
- Opening configuration must not silently start xpod. Start/restart remains an explicit runtime action.
- Settings surfaces expose pending, success, and failure states locally and use accessible selected/navigation semantics.

## Architecture Gates

Each module receives a source-level architecture test that proves:

1. canonical layer directories and owner files exist;
2. root compatibility files contain exports only;
3. `ui/` does not import module data/store/features/app;
4. `domain/` does not import React, UI, data, app, router, or desktop APIs;
5. `data/` does not import UI/features/app or Zustand;
6. feature code imports canonical owners rather than root shims;
7. the module registry imports app/feature entry points;
8. production files do not duplicate durable model contracts already owned by `@undefineds.co/models`.
9. sibling modules do not instantiate a second Collection for a resource owned by one of these modules.

## Verification

- Architecture and domain tests per module.
- Existing module component and Collection tests migrated to canonical paths.
- Real local xpod integration tests for contact and model-service persistence.
- Web lint, production TypeScript/build, and full affected Vitest suites.
- Browser keyboard walkthrough for the three list/detail paths and settings disclosure.
