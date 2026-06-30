# Personal Linked Context Unified Change List

This is the single implementation checklist for turning Personal Linked Context
into working product behavior. It consolidates the scattered specs into one
ordered change list.

## Operating Rule

This file is the execution source of truth for the current Personal Linked
Context work. When implementation discovers a new required change, add it here
first under the owning package section before coding downstream behavior.

Do not maintain parallel TODOs in prompts, ad-hoc notes, marketplace skills, or
package-local scratch docs. Those surfaces can explain their local behavior, but
the cross-repo modification list lives here.

Each change below is intentionally expressed as:

- owner package or repo;
- product invariant being protected;
- exact capability to add/remove;
- tests that prove it;
- done condition before downstream work can rely on it.

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

## Modification Point Register

This register is the single mutable checklist for the current implementation.
When a new cross-repo change is discovered, add or update a row here first; do
not create parallel TODO lists in prompts, marketplace skills, package-local
scratch docs, or chat transcripts.

### Current Snapshot

Last refreshed: 2026-07-01.

| Package / surface | Version or artifact | Current state | Evidence / next gate |
| --- | --- | --- | --- |
| `@undefineds.co/models` | `0.2.46` | Published upstream dependency for descriptor/resource semantics. | `npm view @undefineds.co/models@0.2.46 version` returned `0.2.46`. |
| `@undefineds.co/drizzle-solid` | `0.3.18` | Published upstream dependency for ORM/resource-file helpers. | `npm view @undefineds.co/drizzle-solid@0.3.18 version` returned `0.3.18`. |
| `@undefineds.co/xpod` | `0.3.57` published; source fix branch `fix/plc-obj-cloud-upsert` at `e88f6a3` | Published AI-facing object discovery/write CLI. A source fix now proves authenticated Cloud `obj upsert --commit` plus exact-subject `obj get` read-back; npm release/consumption is still pending. | `npm view @undefineds.co/xpod@0.3.57 version` returned `0.3.57`; branch `fix/plc-obj-cloud-upsert` pushed to `undefinedsco/xpod`; live authenticated smoke wrote and read `https://id.undefineds.co/gcloud/.data/ideas/verification/obj-cloud-readback-20260630T180447Z.ttl#this`. |
| LinX CLI | source `0.3.32`; package artifact `preview/undefineds-co-linx-0.3.32.tgz` | Source consumes published upstream versions. Released through GitHub Actions after the JSONL contract wording change; npm package and GitHub Release are published. | Verified: projection test 132/132 pass; `yarn build:cli`; `yarn typecheck:web`; `yarn pack:cli:release`; `node scripts/smoke-install-cli-release.mjs`; CLI Release run `28438200195`; `npm view @undefineds.co/linx@0.3.32 version`; GitHub Release `linx-v0.3.32`. |
| Marketplace skills | `linx-capture`; `linx-symphony` | Skills route AI through discovery-first xpod/model writes. Verification passed after the JSONL wording and Symphony `pending_local` contract changes; marketplace `main` is pushed at `b0fdfb5`. | Verified: `LINX_MARKETPLACE_ROOT=/Users/ganlu/develop/marketplace yarn verify:symphony-skills` (22 scenarios pass); pushed `undefinedsco/marketplace` main to `b0fdfb5`; refreshed Codex marketplace snapshot and reinstalled `linx-symphony@undefineds`. |
| Codex acceptance sample | scripted via `yarn benchmark:plc-agent-skills:codex-e2e` | Passed against installed Codex + `xpod`: Codex loaded the full plugin skill `$linx-capture:capture`, discovered schemas, described `CapturePolicy`, dry-ran with JSONL stdin, then committed unauthenticated state as `pending_local`. | Verified 2026-07-01: `PASS codex-e2e:no-login-local-first`; script checks final compact JSON and a non-empty temporary `$SOLID_HOME/apps/xpod/outbox/obj-mutations.jsonl`. |
| PLC Agent Skill Benchmark | `yarn benchmark:plc-agent-skills`; `yarn benchmark:plc-agent-skills:codex-e2e`; `yarn verify:plc-agent-skills:codex` | Repository-local benchmark now gates portable Capture/Symphony skill contracts, xpod descriptor discovery/dry-run behavior, real Codex no-login local-first capture, and installed Codex skill-cache freshness. It intentionally does not claim authenticated Pod commit success. | Verified locally: static skill contract, `xpod obj schemas`, `xpod obj schemas --domain symphony`, `obj describe Idea/Task`, `obj upsert --dry-run` for Idea/Task, real Codex no-login `pending_local` outbox, and Codex installed-cache freshness for both `linx-capture` and `linx-symphony`. |

### Unified Change Points

| ID | Status | Owner repo/package | Product invariant | Required change | Implementation files | Verification | Blocks / downstream dependency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PLC-1 | published: `@undefineds.co/models@0.2.46` | `@undefineds.co/models` | Shared models are the authority for resource semantics, ids, relations, aliases, capture fallback records, and document/source policies. | Describe all Personal Linked Context resources and expose descriptor metadata, exact-id semantics, relation fields, aliases, resource-owned file path helpers, and no duplicated storage-base expansion for exact base-relative ids. | `src/namespaces.ts`; `src/pod-storage-descriptor.ts`; `src/personal-linked-context-paths.ts`; `src/idea.schema.ts`; `src/issue.schema.ts`; `src/report.schema.ts`; `src/evidence.schema.ts`; `src/index.ts` | Upstream tests/build completed before publish; npm version verified from registry. | xpod discovery, LinX capture, marketplace skills |
| PLC-2 | published: `@undefineds.co/drizzle-solid@0.3.18` | `drizzle-solid` | Product shells must not hand-coordinate metadata/file writes, exact-id resolution, rollback, relinking, or duplicate-path checks. | Provide generic resource-with-file dry-run, commit, move/relink, delete, exact-id planning, duplicate path rejection, and compensating cleanup. | `src/core/pod-database.ts`; `tests/unit/core/resource-with-document.test.ts` | Upstream tests/build completed before publish; npm version verified from registry. | xpod safe writes, LinX authenticated capture |
| PLC-3 | published: `@undefineds.co/xpod@0.3.57`; source fix pushed: `fix/plc-obj-cloud-upsert` `e88f6a3` | `xpod` CLI | AI agents discover current record types from models/policy instead of prompt memory; no-login capture produces durable local pending state; authenticated Cloud writes must be readable back without depending on the sidecar SPARQL query path. | Expose `obj schemas`, `obj describe`, descriptor-backed `obj upsert --dry-run/--commit`, Cloud-compatible per-field `DELETE WHERE` + `INSERT DATA`, and exact-subject direct Turtle read fallback when SPARQL query returns 400. | `src/cli/commands/obj.ts`; `tests/cli/obj.test.ts`; root platform package pins | Branch verified: `bun run test:run tests/cli/obj.test.ts`; `bun run test:run tests/cli/rdf.test.ts`; `bun run build:ts`; live authenticated `obj upsert --commit` + `obj get` read-back against `https://id.undefineds.co/gcloud/`. Release still pending. | AI-side capture and Symphony writes |
| PLC-4 | released: `@undefineds.co/linx@0.3.32` | LinX runtime | LinX shell injects domain/discovery context but does not own schemas, fields, path templates, or capture classification enums. | Remove shell-owned schema assumptions; keep Symphony/Capture projection discovery-first; keep no-login local-first and logged-in Pod-first behavior; mention JSONL stdin for xpod object writes. | `apps/cli/src/lib/linx-symphony-interactive-command.ts`; `apps/cli/src/lib/models.ts`; LinX/web callers updated for `@undefineds.co/models@0.2.46` API | Verified: Pi interactive bootstrap test file 132/132 pass; `yarn build:cli`; `yarn typecheck:web`; `yarn pack:cli:release`; smoke install; CLI Release run `28438200195` passed and published npm/GitHub Release. | product behavior |
| PLC-5 | published to marketplace main `b0fdfb5` | marketplace skills | Skills describe judgment workflow and portability, not storage schemas. | Update `linx-capture` and `linx-symphony` to route writes through discovered xpod/model descriptors, avoid fixed field/path/predicate definitions, require JSONL stdin for `--from -`, and report no-auth `pending_local` honestly. | `/Users/ganlu/develop/marketplace/plugins/linx-capture/skills/capture/SKILL.md`; `/Users/ganlu/develop/marketplace/plugins/linx-symphony/skills/symphony/SKILL.md` | Verified: `verify:symphony-skills` 22 scenarios pass; marketplace main pushed to `b0fdfb5`; Codex marketplace snapshot upgraded and installed cache freshness gate passes. | Codex/CC portability |
| PLC-6 | release and no-login acceptance pass | release/integration | The feature is complete only when released packages are consumed and Codex can perform capture through discovery-first xpod/model writes. | Publish in dependency order, upgrade LinX dependencies, build/pack/smoke-install LinX, then run Codex capture acceptance against installed packages rather than local worktree wrappers. | LinX dependency versions; package release metadata; smoke install artifacts; `scripts/benchmark-plc-agent-skills.mjs`; `tests/plc-agent-skill-benchmark.test.mjs` | Scripted acceptance ran `$linx-capture:capture`, `xpod obj schemas --json`, `xpod obj describe CapturePolicy --json`, JSONL dry-run, and JSONL no-auth commit returning `pending_local`; LinX build/pack/smoke gates pass locally; `linx-v0.3.32` release published. | feature completion |
| PLC-7 | verified | xpod contract docs + runtime prompts + skills | `xpod obj upsert --from -` must be machine-safe and unambiguous for AI tools. | Document and project into prompts that stdin is JSONL: one JSON object per line, not pretty multi-line JSON. | `docs/personal-linked-context-change-list.md`; `docs/personal-linked-context.md`; `docs/xpod-cli-spec.md`; `apps/cli/src/lib/linx-symphony-interactive-command.ts`; marketplace skill files; `scripts/verify-symphony-skills.mjs` | Verified: skill verifier passes and LinX projection test file passes. | prevents repeat Codex acceptance failure on pretty JSON stdin |

### Required Acceptance Slice

The first complete vertical slice must prove this exact path:

1. Codex has the LinX capture skill installed and invokable by full plugin skill
   name (`$linx-capture:capture`). Do not rely on the shorthand `$capture` as a
   release gate until Codex aliases are explicitly supported and verified.
2. User says something worth preserving.
3. Skill tells Codex to discover available record types, not assume `Idea`.
4. Codex runs `xpod obj schemas --json`.
5. Codex runs `xpod obj describe <chosen-schema-or-alias> --json`.
6. Codex runs `xpod obj upsert ... --dry-run --json` with JSONL stdin
   (one JSON object per line).
7. Codex either:
   - commits the modeled metadata plus linked file body when authenticated; or
   - writes a local pending/outbox record when unauthenticated.
8. Final user-visible response reports the actual persistence status and final
   resource/document paths.

This slice is the minimum verification for claiming Personal Linked Context
capture works. Unit tests alone are not enough.

`yarn benchmark:plc-agent-skills` is the portable pre-commit benchmark for this
slice. It proves the skill contract and descriptor dry-run path only.
`yarn benchmark:plc-agent-skills:codex-e2e` is the real Codex no-login
acceptance gate. It runs Codex in a temporary workspace and isolated
`SOLID_HOME`, requires `pending_local`, and checks the local outbox file exists
and is non-empty.
`yarn verify:plc-agent-skills:codex` additionally checks the installed Codex
plugin cache against the marketplace skill source so stale installed skills do
not pass review by accident. This gate must pass after marketplace publication
and plugin reinstall/refresh. A source-branch throwaway-Pod acceptance run
has proved authenticated `xpod obj upsert --commit --json` writes and modeled read-back work end to end
on `fix/plc-obj-cloud-upsert`; this is not a release claim until the xpod npm
package is published and consumed by LinX/Codex installed packages.

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
# stdin is JSONL: one JSON object per line, not pretty multi-line JSON
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

## Follow-Up Evidence

These items are not blockers for the no-login Codex capture acceptance slice.
Add new cross-repo gates to the register above instead of creating side TODOs.

1. Publish the xpod Cloud upsert/read-back fix as the next `@undefineds.co/xpod`
   version and update LinX/Codex-installed acceptance to consume the published
   package rather than the source worktree.
