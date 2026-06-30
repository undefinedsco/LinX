# Personal Linked Context Unified Change List

This is the single implementation checklist for turning Personal Linked Context
into working product behavior. It consolidates the scattered specs into one
ordered change list.

## Source Specs

Read these in order when implementing:

1. `docs/personal-linked-context.md` — product/storage model and terminology.
2. `docs/pod-interaction-layering.md` — ownership across models,
   drizzle-solid, use-cases, xpod, and product shells.
3. `docs/xpod-cli-spec.md` — AI-facing Pod CLI discovery, dry-run, and write
   behavior.
4. `docs/symphony-system-evolution-control-plane.md` — Symphony domain policy
   and control-plane behavior.
5. `docs/linx-shell-core-design.md` — LinX shell/core boundary and what must
   not be implemented as shell keyword logic.

## Target Architecture

LinX builds Personal Linked Context on a model-defined semantic file system:

```text
user/project files                     typed resource graph
  markdown/report/log/patch/etc.   <->   metadata/relation/status/index
```

The product invariant is:

- file bodies may live in project/user-friendly folders;
- business metadata and relations live in typed modeled resources;
- models and ORM generate ids, paths, links, validation, and dry-run plans;
- AI tools discover available record types before writing;
- product shells do not hand-write Turtle, predicates, subject templates, or
  document paths for shared resources.

## Dependency Order

Implement in this order. Do not start downstream shell behavior before the
upstream model/tool surface exists.

```text
1. @undefineds.co/models
2. drizzle-solid
3. xpod CLI
4. LinX runtime / Symphony / Capture projection
5. marketplace skills
6. release + integration verification
```

## 1. `@undefineds.co/models`

### Goal

Models defines the shared semantic contract: record types, relation fields,
queryable metadata, default id/path policy, and resource-specific helper APIs.

### Required Changes

- Add or normalize document/file-primary relations on shared resources:
  - `document` for long human-facing body;
  - `source` for raw evidence/source artifact;
  - `about` for the modeled resource an artifact supports or describes;
  - `project`, `thread`, `task`, `run`, `maker` where already semantically
    required.
- Keep generic resources under generic paths, not Symphony paths:
  - `/.data/ideas/...`
  - `/.data/issues/...`
  - `/.data/tasks/...`
  - `/.data/runs/...`
  - `/.data/reports/...`
  - `/.data/evidence/...`
  - `/.data/approvals/...`
  - `/.data/inbox/...`
- Add resource-owned default path helpers for file-primary bodies. Example API
  shape:

  ```ts
  ideaResource.defaultDocumentPath(row, policy)
  issueResource.defaultDocumentPath(row, policy)
  reportResource.defaultDocumentPath(row, policy)
  evidenceResource.defaultSourcePath(row, policy)
  ```

  Exact names can follow models repo conventions, but the helper must be owned
  by the resource/model layer, not by LinX shell code.

- Add or formalize capture policy resources:
  - user global capture policy;
  - agent capture policy;
  - project capture policy;
  - optional thread/session override.
- Add modeled fallback records if missing:
  - `CaptureDraft`: durable signal identified, target type not yet selected;
  - `ModelingProposal`: proposed new record type/schema/folder policy.
- Expose descriptor metadata required by xpod:
  - stable alias;
  - schema URI;
  - fields and required fields;
  - relation fields;
  - id semantics;
  - default resource path;
  - default document/source path policy;
  - example input row;
  - whether explicit `id` is exact.

### Tests

- Resource id/default tests assert canonical `/.data/<resource-kind>/...` paths.
- Relation tests assert `document`, `source`, and `about` serialize as URI
  relations, not string path fields.
- Descriptor tests assert every xpod-exposed resource has required discovery
  metadata.
- Path policy tests assert project/user overrides change file body paths without
  changing the modeled resource namespace.
- Regression test rejects duplicated path composition such as:

  ```text
  projects/foo/ideas/projects/foo/ideas/bar
  ```

### Done When

- Models can describe all target resources without LinX-specific prompt text.
- No shared resource requires LinX CLI/Web to build a Turtle subject or document
  path by hand.

## 2. `drizzle-solid`

### Goal

ORM provides generic resource + file composition so product shells do not
manually coordinate metadata writes, file writes, rollback, relinking, or
validation.

### Required Changes

- Add generic dry-run support for a modeled resource write that returns:
  - final resource URL;
  - final subject IRI;
  - final base-relative id;
  - planned RDF mutations;
  - planned file writes;
  - validation warnings/errors.
- Add generic resource-with-document/source operations. Example API shape:

  ```ts
  db.dryRunResourceWithDocument(resource, input)
  db.upsertResourceWithDocument(resource, input)
  db.moveDocumentAndRelink(resource, input)
  db.deleteResourceWithDocument(resource, input)
  ```

  Exact names can follow drizzle-solid style; the capability must be generic.

- Enforce exact-id semantics:
  - explicit base-relative `id` is exact;
  - slug/key input must be separate from exact id input;
  - full IRI goes through `ByIri`, not `ById`.
- Validate duplicate path segments and ambiguous exact-vs-key inputs before
  commit.
- Provide rollback or compensating cleanup for multi-write failures:
  - file write succeeds, metadata write fails;
  - metadata write succeeds, file write fails;
  - relink succeeds, old file delete fails.

### Tests

- Dry-run returns identical paths to commit without mutating Pod.
- Upsert writes metadata and file body, then returns both row and document/source
  IRI.
- Failure injection covers metadata failure after file write and file failure
  after metadata write.
- Move/relink test verifies modeled `document` or `source` relation changes and
  old relation is removed.
- Exact-id tests reject duplicate path expansion.

### Done When

- xpod and LinX can call ORM helpers instead of hand-assembling resource/file
  writes.

## 3. xpod CLI

### Goal

xpod becomes the AI-facing model discovery and safe write tool. AI should not
need to know model internals from prompt memory.

### Required Commands

```bash
xpod obj schemas --json
xpod obj schemas --domain <domain> --json
xpod obj describe <schema-or-alias> --json
xpod obj upsert --schema <schema-or-alias> --from <jsonl-or-stdin> --dry-run --json
xpod obj upsert --schema <schema-or-alias> --from <jsonl-or-stdin> --commit --json
```

### Required Behavior

- `schemas` lists discoverable record types from models and active policy.
- `schemas --domain symphony` includes Symphony control-plane defaults plus any
  user/project overrides.
- `describe` returns descriptor metadata from models.
- `upsert --dry-run` prints planned resource URL, subject IRI, document/source
  path, warnings, and errors.
- `upsert --commit` refuses to run if validation errors exist.
- `upsert` rejects unknown fields unless the descriptor explicitly allows an
  extension/metadata bag.
- xpod warnings go to stderr; `--json` stdout remains parseable JSON.

### Tests

- CLI JSON tests parse stdout even when Node warnings appear on stderr.
- `schemas` includes expected generic resources and policy-provided capture
  types.
- `describe Idea` or equivalent returns id semantics and document path policy.
- `upsert --dry-run` shows final paths and does not write.
- Duplicate path input fails before commit.
- Unknown modeled field fails before commit.

### Done When

- An AI can discover a record type, inspect fields/path policy, dry-run, and
  commit without reading LinX implementation code.

## 4. LinX Runtime / Capture / Symphony

### Goal

LinX injects the correct domain context and delegates model details to xpod and
models. Capture remains an AI judgment, not a shell keyword detector.

### Required Changes

- Update Symphony-on context injection to provide:

  ```text
  Symphony is on. You are operating in the Symphony control-plane domain.
  Discover current resource types and descriptors through the Pod/model tool
  surface before mutating modeled records. Use dry-run before commit.
  ```

- Remove fixed resource schema lists from runtime prompt wrappers. It is fine to
  mention the discovery entry points; do not duplicate field definitions.
- Capture flow:
  1. AI decides whether a message contains a durable signal.
  2. AI discovers current capture policy and record types.
  3. If a matching type exists, AI uses `xpod obj describe` and `upsert --dry-run`.
  4. If no matching type exists, AI creates local pending record,
     `CaptureDraft`, or `ModelingProposal`.
  5. AI reports actual persistence status.
- Shell must not create Idea/Issue/etc. from broad trigger words before AI
  judgment.
- No-login behavior remains local-first:
  - write pending local/outbox record;
  - mark Pod persistence pending;
  - replay after login/auth recovery.
- Logged-in behavior is Pod-first:
  - modeled resource write is shared authority;
  - local files are cache/retry/recovery only.

### Tests

- Shell submit tests prove broad trigger words do not create modeled Pod records
  before AI handling.
- Prompt/projection tests prove Symphony-on context contains discovery entry
  points and no hardcoded descriptor field lists.
- No-login test creates pending local/outbox record, not fake Pod success.
- Logged-in test uses xpod/model surface and reports dry-run/commit paths.
- Regression test ensures internal prompt wrapper is not rendered as product
  Message content.

### Done When

- LinX can run capture/Symphony without hardcoded record-type assumptions in the
  shell.

## 5. Marketplace Skills

### Goal

Skills describe judgment and workflow, not storage schemas.

### Required Changes

- `linx-capture` skill:
  - say AI decides whether a durable signal exists;
  - say concrete type comes from policy/model discovery;
  - remove wording that implies fixed Idea/Decision/Finding enum;
  - specify fallback to local pending record / `CaptureDraft` /
    `ModelingProposal`.
- `linx-symphony` skill:
  - say Symphony-on enables control-plane policy for system evolution domain;
  - say resources are discovered through model/xpod tooling;
  - avoid storing field definitions, path templates, or predicate lists.
- Keep skills portable across LinX runtime, Codex, Claude Code, and other agent
  shells.

### Tests

- Marketplace plugin validation passes.
- LinX `yarn verify:symphony-skills` passes.
- Prompt text scan confirms no fixed field schema or hardcoded path template in
  skills.

### Done When

- Skills route AI behavior to discovery-first writes without duplicating model
  semantics.

## 6. Release And Integration Verification

### Required Cross-Repo Release Order

```text
1. Publish @undefineds.co/models
2. Publish drizzle-solid
3. Publish xpod CLI
4. Upgrade LinX dependencies
5. Release LinX
6. Publish marketplace skills if changed
```

If a downstream package needs an upstream feature, release the upstream package
first and consume the published version. Do not rely on local sibling checkout
for release artifacts.

### Required End-to-End Tests

- Local no-login capture creates pending record and does not claim Pod success.
- Authenticated capture discovers schemas, describes target type, dry-runs, then
  commits modeled metadata and file body.
- Symphony-on creates/updates control work only inside the Symphony domain.
- Non-Symphony personal memory uses general capture policy, not Symphony types.
- A file-primary report/evidence body is stored as a file and linked from
  modeled metadata.
- Moving a document updates modeled link and preserves queryability.
- xpod `--json` output remains parseable with warnings on stderr.

### Release Gates

Before claiming the feature complete:

```bash
yarn verify:symphony-skills
yarn build:cli
yarn pack:cli:release
node scripts/smoke-install-cli-release.mjs
```

For changes in external repos, also run their owning test/build/publish smoke
commands and record the package versions consumed by LinX.

## Non-Goals

- Do not build a LinX-only capture database.
- Do not store generic work resources under `/.data/symphony/`.
- Do not hand-write Turtle for modeled resources in LinX runtime prompts or
  shell code.
- Do not make `.meta` the primary business index.
- Do not require AI to know `Idea` or any fixed record type from prompt memory.
- Do not block local-first capture solely because the user is not logged in.

## Open Design Checks Before Implementation

These are the only unresolved naming/API details; resolve them in the owning
repo before coding downstream behavior:

1. Final names for ORM resource-with-document helpers.
2. Final aliases for `CaptureDraft` and `ModelingProposal` if models already has
   equivalent concepts.
3. Final policy resource paths for user / project / agent / thread capture
   policy.
4. Exact xpod command names if `schemas` / `describe` need to match existing
   xpod command style.
