# xpod Owner Permission Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make newly provisioned and migrated local Pods discoverable by CSS authorization so a DPoP-authenticated owner receives ACP/ACL-equivalent read/write permissions instead of 403.

**Architecture:** Fix the xpod provisioning boundary, not browser auth state. `LocalPodProvisioningService` must write the same indexed quint columns as `SqliteQuintStore`; otherwise exact object lookups used by metadata/authorization can miss rows inserted after the store's startup migration. Existing null-index rows are repaired by the store's normal idempotent schema backfill on restart, then verified through real CSS owner requests.

**Tech Stack:** Bun, TypeScript, SQLite QuintStore, Community Solid Server 8 alpha, ACP policy-engine, Vitest, DPoP/OIDC integration smoke.

**Repository:** `/Users/ganlu/develop/xpod`

---

### Task 1: Reproduce the provisioning/index mismatch

**Files:**
- Modify: `/Users/ganlu/develop/xpod/tests/provision/LocalPodProvisioningService.test.ts`

- [ ] **Step 1: Add a failing indexed-row assertion**

After `createPod`, assert every provisioned quad has `object_kind`, and exact IRI/blank-node objects have `object_key`. Open the same SQLite file through `SqliteQuintStore` without restarting/migrating and assert an exact `acp:resource` object lookup finds the root ACR row.

```ts
expect(rows.filter((row) => row.object_kind === null)).toHaveLength(0)
expect(await store.get({ predicate: namedNode(`${ACP}resource`), object: namedNode(podUrl) })).toHaveLength(1)
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun run test:run tests/provision/LocalPodProvisioningService.test.ts`

Expected: FAIL because `writeQuints` inserts only legacy graph/subject/predicate/object/vector columns.

### Task 2: Write canonical indexed quint rows during provisioning

**Files:**
- Modify: `/Users/ganlu/develop/xpod/src/provision/LocalPodProvisioningService.ts`
- Reuse: `/Users/ganlu/develop/xpod/src/storage/quint/value-types.ts`
- Reuse: `/Users/ganlu/develop/xpod/src/storage/quint/serialization.ts`

- [ ] **Step 1: Compute the canonical object index fields**

For each Quad, use `quadToRow(entry)` plus `objectIndexFieldsFromTerm(entry.object, { predicate: entry.predicate.value })`. Set `object_digest` to SHA-256 only when `objectKey` is null, matching `SqliteQuintStore`.

- [ ] **Step 2: Replace the legacy insert statement**

Insert `object_kind`, `object_key`, `object_text`, `object_digest`, graph, subject, predicate, object, and vector. Use the same key/digest conflict targets as `SqliteQuintStore` so provisioning stays idempotent.

- [ ] **Step 3: Run focused storage/provisioning tests**

Run:

```bash
bun run test:run tests/provision/LocalPodProvisioningService.test.ts tests/storage/mix/MixDataAccessor.integration.test.ts
bun run build:ts
```

Expected: PASS.

### Task 3: Verify migration and policy-engine semantics

**Files:**
- Modify: `/Users/ganlu/develop/xpod/tests/provision/LocalPodProvisioningService.test.ts`
- Create: `/Users/ganlu/develop/xpod/tests/authorization/LocalPodOwnerAuthorization.test.ts`

- [ ] **Step 1: Cover legacy null-index backfill**

Seed legacy rows with null index columns, open `SqliteQuintStore`, and assert its idempotent startup migration fills kind/key/digest without changing graph/subject/predicate/object identity.

- [ ] **Step 2: Evaluate the generated ACR through the real policy-engine stack**

Load the provisioned root ACR rows through `rowToQuad`, `ManagedAcpRepository`/equivalent test repository, `AcpPolicyEngine`, and `AclPermissionsEngine`. Assert `PERMISSIONS.Read`, `PERMISSIONS.Modify`, and create/delete parent semantics resolve for the external owner WebID.

- [ ] **Step 3: Run authorization tests**

Run: `bun run test:run tests/authorization/LocalPodOwnerAuthorization.test.ts tests/provision/LocalPodProvisioningService.test.ts`

Expected: PASS.

### Task 4: Rebuild the managed runtime and run real owner requests

**Files:**
- No source additions unless the smoke exposes a separate proven defect.

- [ ] **Step 1: Build xpod and prepare the Desktop resource**

Run:

```bash
bun run build:ts
bun run build:components
yarn --cwd /Users/ganlu/develop/linx-files workspace @linx/desktop build
```

Expected: PASS.

- [ ] **Step 2: Restart only the managed local runtime**

Use the Desktop/runtime manager stop/start path so `SqliteQuintStore` performs the idempotent legacy backfill. Do not delete Pod data, identity DB, tokens, localStorage, or Electron Safe Storage.

- [ ] **Step 3: Verify the owner path**

With the existing authenticated owner session, verify:

```text
HEAD /bob/                         -> 200
HEAD /bob/.data/                   -> 200 or 404, never 403
POST /bob/.data/-/sparql           -> 2xx
PATCH/PUT a disposable test file   -> 2xx
```

Also assert xpod logs contain DPoP verification and no subsequent “has no urn:report:permissions:Read permissions” for the owner.

- [ ] **Step 4: Run full xpod regression**

Run: `bun run test:integration`

Expected: PASS, as required by xpod repository policy.
