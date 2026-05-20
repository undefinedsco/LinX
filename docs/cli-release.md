# LinX CLI Release

LinX CLI release publishes two npm packages under the Undefineds scope:

- `@undefineds.co/models`
- `@undefineds.co/linx`

The CLI package depends on `@undefineds.co/models` at the same exact version. Do not publish the raw workspace package directly unless the package metadata has been converted to its publish form; the workspace package uses development exports and wildcard workspace dependencies.

## Current Release Path

Build both packages and emit npm-installable tarballs:

```bash
yarn pack:cli:release
```

The outputs are:

```text
preview/undefineds-co-models-<version>.tgz
preview/undefineds-co-linx-<version>.tgz
```

The release pack script converts `packages/models` exports from `src/*.ts` to `dist/*.js` and makes `apps/cli` depend on the exact same `@undefineds.co/models` version.

`@undefineds.co/models` is a shared contract package for xpod and LinX. It is not owned by the CLI release script. The root `pack:cli:release` command only orchestrates the order:

```text
build models -> pack @undefineds.co/models -> build CLI -> pack @undefineds.co/linx
```

xpod can use the same models package by depending on `@undefineds.co/models` and running the models pack command directly:

```bash
yarn workspace @undefineds.co/models pack:release
```

For timestamped self-contained preview builds that do not require a separately installed models package:

```bash
yarn pack:cli:preview
```

## Local Verification

Install the produced tarball into an isolated npm prefix before publishing or uploading it:

```bash
node scripts/smoke-install-cli-release.mjs
```

This verifies that the CLI resolves `@undefineds.co/models` through normal npm dependency resolution instead of a workspace-only link. It also verifies the installed `@undefineds.co/drizzle-solid` package contains the compound URI template link-resolution fix required by the Pod chat/thread/message path. `linx --help` and `linx --version` passing is not enough for release readiness.

The required `@undefineds.co/drizzle-solid` runtime fix has two externally visible effects:

- Inserting a message with `message.chat` and `message.thread` resolves inverse links to concrete chat/thread IRIs.
- Generated triples must never contain unresolved template variables such as `{chat}`.

If the smoke script fails on the drizzle-solid check, publish a fixed `@undefineds.co/drizzle-solid` first and then rebuild the models and CLI tarballs. Do not publish `@undefineds.co/models` or `@undefineds.co/linx` against a registry drizzle-solid version that still only replaces `{id}` in linked table templates.

## Production Pod Smoke Account

Production smoke scripts that write to a real Pod must use a dedicated smoke-test account, not a developer or customer account. The scripts refuse to run unless the active LinX login WebID exactly matches `LINX_PROD_SMOKE_WEBID`.

Recommended setup:

```bash
export LINX_PROD_SMOKE_WEBID=https://id.undefineds.co/<smoke-user>/profile/card#me
HOME=/tmp/linx-prod-smoke-home linx login
HOME=/tmp/linx-prod-smoke-home LINX_PROD_SMOKE_WEBID=$LINX_PROD_SMOKE_WEBID node scripts/verify-cli-pod-durable.mjs
```

The isolated `HOME` keeps the smoke account's `~/.linx` credentials separate from the user's normal LinX account. `scripts/verify-cli-pod-durable.mjs` and `scripts/prod-pod-core-crud.mjs` are write smoke tests; they should never default to the currently logged-in personal account.

## npm Registry Publish

Publish models first, then CLI:

```bash
npm publish --access public preview/undefineds-co-models-<version>.tgz
npm publish --access public preview/undefineds-co-linx-<version>.tgz
```

After registry publication, users install:

```bash
npm i -g @undefineds.co/linx
```

Use `--omit=peer` for the normal CLI install path:

```bash
npm i -g --omit=peer @undefineds.co/linx
```

npm 7+ auto-installs peer dependencies, including `drizzle-orm` optional database driver peers that are not needed by LinX CLI. The CLI release smoke test and in-TUI updater intentionally install with `--omit=peer` so global installs stay small and avoid fetching optional SQL drivers such as `better-sqlite3`, `pg`, or AWS database clients.

If a new models release depends on ORM behavior, publish order is:

```text
@undefineds.co/drizzle-solid -> @undefineds.co/models -> @undefineds.co/linx
```

## Regional Deployments

Do not split the npm product package by deployment region. The public CLI product package stays:

```text
@undefineds.co/linx
```

Do not create package variants such as `@undefineds.co/linx-cn`. That makes versioning, update prompts, support, and user documentation diverge for the same product.

xpod/cloud can still be deployed as separate regional stacks, for example overseas and mainland China. The regional difference is an endpoint/configuration concern, not a separate CLI product identity:

```text
overseas xpod/cloud -> overseas issuer + runtime API
mainland xpod/cloud -> mainland issuer + runtime API
```

The CLI should support choosing those endpoints through runtime configuration, login URL overrides, environment variables, or a first-run region selector. If a regional installer is needed, it should install the same `@undefineds.co/linx` package and write the region-specific default config after install.

Good release shape:

```text
one npm package: @undefineds.co/linx
one update stream: @undefineds.co/linx
multiple xpod deployments: selected by config
optional regional install pages/scripts: same package, different default config
```

Avoid this release shape:

```text
@undefineds.co/linx
@undefineds.co/linx-cn
@undefineds.co/linx-overseas
```

## Install Performance

The CLI install path should stay as small as possible because users install it globally. Keep `apps/cli/package.json` limited to dependencies directly imported by CLI runtime code.

Current direct CLI runtime dependencies are:

```text
@undefineds.co/models
@inrupt/solid-client-authn-node
@mariozechner/pi-coding-agent
yargs
```

Global install commands should include `--omit=peer`:

```bash
npm i -g --omit=peer @undefineds.co/linx
```

`@undefineds.co/models` depends on `@undefineds.co/drizzle-solid`, which depends on `drizzle-orm`. `drizzle-orm` publishes many optional peer dependencies for SQL/database adapters. LinX CLI does not need those adapters, and npm will otherwise auto-install them. Keep release verification and update prompts on the `--omit=peer` path unless CLI code starts importing those peer packages directly.

`@comunica/query-sparql-solid` is not a CLI product dependency. It belongs behind `@undefineds.co/models` because the CLI calls the shared profile/chat/session APIs, while models owns the Solid/drizzle-solid data access boundary. Do not add `@undefineds.co/drizzle-solid`, `@comunica/query-sparql-solid`, or `@inrupt/vocab-common-rdf` directly to the CLI package unless CLI code imports them directly.

The remaining install-time cost is mostly transitive:

- `@mariozechner/pi-coding-agent` brings the native Pi TUI/runtime stack.
- `@inrupt/solid-client-authn-node` brings browser-consent OIDC support.
- `@undefineds.co/models` brings `@undefineds.co/drizzle-solid` and the Solid SPARQL query engine needed by the current Pod/profile read path.

The models package must not expose or publish local storage engines. xpod owns runtime storage; LinX and xpod share `@undefineds.co/models` only for data semantics, schemas, vocabs, contracts, and lightweight client helpers. Keep storage-only code and dependencies out of models:

```text
better-sqlite3
pg
quadstore
quadstore-comunica
@comunica/query-sparql
@comunica/types
```

Do not add `./storage` to models exports and do not make LinX CLI install storage dependencies. If xpod needs local RDF/SPARQL/SQL engines, they belong in the xpod package and release pipeline.

The next structural optimization is removing `@comunica/query-sparql-solid` from the models install path. That requires replacing startup profile/name lookup with a lightweight Solid profile fetch/parser, or moving that lookup behind an optional dependency boundary. Publishing multiple regional CLI packages is not an install-performance fix.

## CI/CD

CLI CI runs on Linux, macOS, and Windows with Node 22:

```text
.github/workflows/cli-ci.yml
```

The CI path builds models, builds CLI, runs CLI tests, packs release tarballs, and installs the tarballs into an isolated global npm prefix before running:

```bash
linx --help
linx --version
```

Release publishing is handled by:

```text
.github/workflows/cli-release.yml
```

It verifies the same release tarballs on Linux, macOS, and Windows. Only the Linux artifact is uploaded for publish. Publishing runs in order:

```text
@undefineds.co/models -> @undefineds.co/linx
```

Automatic publish happens on tags matching `linx-v*`. Manual `workflow_dispatch` can verify without publish, or publish when `publish=true`. npm publishing requires `NPM_TOKEN` in GitHub Actions secrets.

## Shared Models Development

`@undefineds.co/models` should be versioned as the schema/API truth shared by xpod and LinX:

- Use semver for compatibility: patch for fixes, minor for additive schema/API, major for breaking schema/API.
- Publish models before publishing xpod or LinX releases that depend on new model APIs.
- Pin runtime packages to an exact models version for release artifacts. The generated CLI package uses `"@undefineds.co/models": "<same-version>"`.
- Keep `packages/models` as the shared models checkout. In the final layout, this path should be a git submodule in both LinX and xpod.
- Do not vendor models into production packages except for emergency preview builds.

The default community path should stay simple:

```bash
git clone --recurse-submodules <repo>
yarn install
yarn dev
```

If the checkout was cloned without submodules:

```bash
yarn models:update
```

Core developers can edit shared model code directly in `packages/models`, then commit in two places:

```bash
cd packages/models
git add .
git commit -m "..."
cd ../..
git add packages/models
git commit -m "Update shared models"
```

`yarn models:status` shows whether `packages/models` is currently a workspace directory, submodule, or symlink. Release packing runs `yarn models:assert-release-safe`; when `packages/models` is a submodule, it refuses to pack while that submodule has uncommitted changes.

## undefineds.co/linx

`npm i -g undefineds.co/linx` is not a normal npm package install form. npm package installs use package names such as `@undefineds.co/linx`, not bare website paths.

The domain can still provide a release channel in either of these forms:

```bash
npm i -g https://undefineds.co/linx/latest.tgz
```

or:

```bash
curl -fsSL https://undefineds.co/linx/install.sh | sh
```

For `https://undefineds.co/linx/latest.tgz`, the server must return the exact tarball produced by `yarn pack:cli:release` with a stable content type and no HTML redirect page.

If the domain hosts a tarball, the endpoint should serve the CLI tarball only after the matching `@undefineds.co/models` version is already published to npm. Otherwise npm cannot satisfy the CLI dependency from the registry.

## Self-Contained Fallback

`yarn pack:cli:selfcontained` still creates a single tarball with vendored models. Keep it as an emergency preview/debug path, not the main npm release channel.
