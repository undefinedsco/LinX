# Chat Desktop Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Secretary immediately useful and permanently first while turning stalled/failed Pod work into bounded, explicit Chat states with aligned 48px heads.

**Architecture:** Add pure Secretary ordering/welcome/status projections under Chat domain, keep Pod writes in collections/bootstrap, and let `ChatContentPane` render a LinX-owned welcome shell independently of persistence. Existing root components remain composition owners; new UI is props-only.

**Tech Stack:** React 19, TypeScript, Zustand, TanStack Query, Vitest/Testing Library, Playwright, Electron.

---

### Task 1: Lock Secretary ordering and first-entry projection

**Files:**
- Create: `apps/web/src/modules/chat/domain/secretary-entry-model.ts`
- Create: `apps/web/src/modules/chat/domain/secretary-entry-model.test.ts`
- Modify: `apps/web/src/modules/chat/components/ChatListPane.tsx`
- Modify: `apps/web/src/modules/chat/components/ChatListPane.test.tsx`

- [ ] **Step 1: Write failing ordering tests**

Cover Secretary before starred chats, stable ordinary starred ordering, and a fixed `isPinned`/`isProtected` projection that cannot expose unpin.

```ts
expect(orderChatItems([starred, secretary, ordinary]).map((item) => item.id))
  .toEqual([LINX_DEFAULT_SECRETARY.chatId, starred.id, ordinary.id])
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `yarn workspace @linx/web vitest run src/modules/chat/domain/secretary-entry-model.test.ts`

Expected: FAIL because `orderChatItems` does not exist.

- [ ] **Step 3: Implement the pure projection and consume it in the list**

Expose `orderChatItems` and `projectSecretaryListCapabilities`; sort by Secretary identity first, then `starred`, preserving source order. Hide ordinary star/delete actions for the fixed Secretary where the current menu would imply unpin/delete.

- [ ] **Step 4: Run Chat list tests**

Run: `yarn workspace @linx/web vitest run src/modules/chat/domain/secretary-entry-model.test.ts src/modules/chat/components/ChatListPane.test.tsx`

Expected: PASS.

### Task 2: Bound Secretary bootstrap without blocking the detail surface

**Files:**
- Modify: `apps/web/src/modules/chat/collections.ts`
- Modify: `apps/web/src/modules/chat/collections.secretary.test.ts`
- Modify: `apps/web/src/providers/pod-collections-bootstrap.tsx`
- Modify: `apps/web/src/providers/pod-collections-bootstrap.test.tsx`

- [ ] **Step 1: Add failing tests for never-settling writes**

Use a deferred insert promise and fake timers. Assert that local Secretary selection remains available immediately, the bootstrap settling signal leaves pending after the configured boundary, and the late promise cannot overwrite a newer account/selection.

```ts
await vi.advanceTimersByTimeAsync(SECRETARY_BOOTSTRAP_TIMEOUT_MS)
expect(isLinxDefaultSecretaryBootstrapSettling()).toBe(false)
```

- [ ] **Step 2: Confirm the tests fail against the unbounded promise**

Run: `yarn workspace @linx/web vitest run src/modules/chat/collections.secretary.test.ts src/providers/pod-collections-bootstrap.test.tsx`

Expected: FAIL because settling remains true.

- [ ] **Step 3: Add an operation-scoped timeout result**

Wrap welcome persistence in a timeout that marks synchronization failed but does not cancel deterministic local projection. Preserve late-write safety with the existing in-flight identity check; do not clear auth storage and do not fabricate a successful persisted message.

- [ ] **Step 4: Run bootstrap tests**

Run the same command. Expected: PASS.

### Task 3: Render welcome, empty, forbidden, timeout, and retry states

**Files:**
- Create: `apps/web/src/modules/chat/domain/chat-content-state.ts`
- Create: `apps/web/src/modules/chat/domain/chat-content-state.test.ts`
- Create: `apps/web/src/modules/chat/ui/SecretaryWelcome.tsx`
- Create: `apps/web/src/modules/chat/ui/SecretaryWelcome.test.tsx`
- Modify: `apps/web/src/modules/chat/components/ChatContentPane.tsx`
- Modify: `apps/web/src/modules/chat/components/ChatContentPane.test.tsx`

- [ ] **Step 1: Write failing state-projection tests**

Cover `welcome`, `loading`, `ready`, `forbidden`, `timeout`, `not-found`, and `login-required`. A finished query with no matching row must not project `loading`.

```ts
expect(projectChatContentState({ isLoading: false, error: forbidden, activeChat: null, isSecretary: true }))
  .toMatchObject({ kind: 'forbidden' })
```

- [ ] **Step 2: Confirm focused tests fail**

Run: `yarn workspace @linx/web vitest run src/modules/chat/domain/chat-content-state.test.ts src/modules/chat/components/ChatContentPane.test.tsx`

Expected: FAIL because query errors are currently ignored.

- [ ] **Step 3: Implement props-only welcome UI and state dispatch**

The welcome surface shows `你好，我是 LinX Secretary`, concise capability copy, three starter actions, and a visible composer host/status. `ChatContentPane` passes query loading/error facts into the pure projector and renders retry for recoverable states.

- [ ] **Step 4: Run the focused UI tests**

Run: `yarn workspace @linx/web vitest run src/modules/chat/domain/chat-content-state.test.ts src/modules/chat/ui/SecretaryWelcome.test.tsx src/modules/chat/components/ChatContentPane.test.tsx`

Expected: PASS.

### Task 4: Align Chat heads and harden browser acceptance

**Files:**
- Modify: `apps/web/src/modules/chat/components/ChatListPane.tsx`
- Modify: `apps/web/src/modules/chat/components/ChatListPane.test.tsx`
- Modify: `tests/e2e/specs/chat-alignment.spec.ts`
- Modify: `tests/e2e/helpers/secretary-bootstrap.ts`

- [ ] **Step 1: Add failing geometry and no-skip assertions**

Compare list/content head bounding boxes and remove the branch that skips while `正在准备话题` is visible. Assert Secretary first, selected, welcome visible, and composer reachable.

- [ ] **Step 2: Run the relevant E2E test and confirm failure**

Run: `LINX_E2E_BASE_URL=http://127.0.0.1:5173 LINX_E2E_REUSE_SERVER=1 yarn workspace @linx/e2e playwright test specs/chat-alignment.spec.ts --workers=1`

Expected: FAIL on 64px versus 48px or missing welcome.

- [ ] **Step 3: Change Chat list header to the shared 48px geometry**

Use `h-12` for both list-header variants, preserve 32px search/add controls, and avoid adding a second header row.

- [ ] **Step 4: Run Chat unit, E2E, lint, and type checks**

Run:

```bash
yarn workspace @linx/web vitest run src/modules/chat src/providers/pod-collections-bootstrap.test.tsx
yarn workspace @linx/web lint
yarn workspace @linx/web tsc --noEmit
```

Expected: all PASS.
