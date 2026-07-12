# Files-Standard Supporting Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring model-services, contacts, and settings onto the Files module ownership template without breaking their public entry points.

**Architecture:** Preserve current runtime behavior through compatibility facades while moving facts, effects, workflows, and rendering to `domain`, `data`, `features`, `ui`, and `app`. Add architecture tests before migration and use existing unit/integration tests as regression locks.

**Tech Stack:** React, TypeScript, Zustand, TanStack Query/DB, drizzle-solid Collections, Vitest, Testing Library, Electron preload bridge.

---

### Task 1: Establish Architecture Gates

**Files:**
- Create: `apps/web/src/modules/model-services/model-services.architecture.test.ts`
- Create: `apps/web/src/modules/contacts/contacts.architecture.test.ts`
- Create: `apps/web/src/modules/settings/settings.architecture.test.ts`

- [x] Assert canonical layer directories and entry owners exist.
- [x] Assert `domain`, `data`, and `ui` forbidden import sets.
- [x] Assert root compatibility files are export-only.
- [x] Run the three tests red against the legacy layout, then green after migration.

### Task 2: Refactor Model Services

**Canonical owners:**
- `app/store.ts`, `app/ModelServicesLayoutConfigBridge.tsx`, `app/use-model-services-layout-config.tsx`
- `domain/provider-catalog.ts`, `domain/model-services-projection.ts`, `domain/types.ts`
- `data/collections.ts`, `data/use-model-services.ts`, `data/model-fetcher.ts`
- `features/list/ModelServicesListPane.tsx`, `features/list/useModelServicesListPaneController.ts`
- `features/detail/ModelServicesContentPane.tsx`, `features/detail/useModelServicesContentPaneController.ts`
- `ui/ModelProviderList.tsx`, `ui/ModelServicesListView.tsx`, `ui/ModelServicesDetailView.tsx`, `ui/ModelEditorDialog.tsx`

- [x] Move durable access and mutation completion into `data/`.
- [x] Add tests proving mutations await persistence, surface rejection, and compensate earlier persisted writes.
- [x] Move list/detail rendering into props-only UI and add keyboard tests.
- [x] Replace the unsupported encryption claim.
- [x] Convert legacy root files into compatibility exports and update registry/bootstrap imports.
- [x] Run model-services unit and xpod integration tests.

### Task 3: Refactor Contacts

**Canonical owners:**
- `app/store.ts`, `app/feature-flags.ts`
- `domain/contact-projection.ts`, `domain/types.ts`
- `data/resource-collections.ts`, `data/collections.ts`, `data/chat-port.ts`
- `features/list/ContactListPane.tsx`, `features/detail/ContactDetailPane.tsx`, `features/detail/use*Controller.ts`, `features/groups/CreateGroupDialog.tsx`
- `ui/ContactList.tsx`, `ui/ContactDetail.tsx`, `ui/SelectableContactList.tsx`, `ui/MemberList.tsx`
- Composition adapter: `modules/chat/contacts-port.ts`, configured by `providers/pod-collections-bootstrap.tsx`

- [x] Extract and test contact classification, grouping, and detail projections.
- [x] Move collection/query/subscription effects to data and feature controllers.
- [x] Make Contacts the sole owner of Contact/Agent Collection instances and compose Chat through injected ports without a module import cycle.
- [x] Add explicit query error and retry UI tests.
- [x] Split profile sync, agent edit, group membership, creation, profile actions, and delete/navigation workflows out of the detail renderer.
- [x] Subscribe detail projections to live Contact and linked Chat collection changes.
- [x] Add button/listbox/checkbox semantics and keyboard tests.
- [x] Convert legacy files to compatibility exports and update cross-module imports where ownership is explicit.
- [x] Run contacts unit and xpod integration tests.

### Task 4: Refactor Settings

**Canonical owners:**
- `app/store.ts`; `app/events.ts` and `app/platform-actions.ts` remain export-only compatibility facades
- `domain/section-model.ts`, `domain/setup-model.ts`, `domain/network-model.ts`, `domain/service-model.ts`, `domain/types.ts`
- `data/setup-client.ts`, `data/use-local-onboarding.ts`, `data/platform-actions.ts`
- `features/list/SettingsListPane.tsx`, `features/content/SettingsContentPane.tsx`, `features/setup/SetupView.tsx`, `features/service/ServiceManagementDialog.tsx`, `features/network/LocalNetworkSettingsCard.tsx`
- Feature controllers live beside each workflow renderer; props-only views live under `ui/`.

- [x] Extract setup/network normalization and API calls into domain/data tests.
- [x] Add advanced disclosure behavior and tests for hidden-by-default network fields.
- [x] Keep start/restart as explicit actions; remove configuration-open side effects from the Web workflow contract.
- [x] Preserve drafts and tunnel credentials when load/save operations fail.
- [x] Add selected navigation and keyboard semantics.
- [x] Convert legacy files to compatibility exports and update layout/router imports.
- [x] Run settings component and domain/data tests.

### Task 5: Integration and Completion Audit

- [x] Run the three architecture suites.
- [x] Run all model-services, contacts, settings, and affected Chat tests after final integration edits.
- [x] Run `yarn workspace @linx/web lint` after final integration edits.
- [x] Run `yarn workspace @linx/web build:check` and the Desktop production build after final integration edits.
- [x] Run affected xpod integration tests in local mode after final integration edits.
- [x] Walk Contacts selection/detail, Settings disclosure, and Model Services selection in Chromium against a seeded real xpod.
- [x] Confirm no production import uses a compatibility path where a canonical owner is available.
- [x] Confirm no unrelated tracked files or user-owned untracked files were modified or staged.
