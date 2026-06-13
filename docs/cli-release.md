# LinX CLI Release

LinX CLI release means producing a verified release artifact and cutting a git
tag. It does not mean that a local agent should run `npm publish` from a
developer machine.

The public package identity remains:

- `@undefineds.co/linx`

The CLI package depends on a published exact `@undefineds.co/models` version,
but the CLI and models package versions are independent. Models is owned and
released from the independent models repository; LinX release automation may
still build or pack a local models checkout during migration, but that is not
the ownership boundary.

Default release authority:

- Humans and local agents commit, verify, push git commits, and create/push the
  release tag.
- GitHub Actions owns npm registry publication for tagged releases.
- Local `npm publish` is an explicit emergency/manual registry operation only.
  Do not infer it from ordinary instructions such as "release", "publish", or
  "发版".

## Current Release Path

Current migration-era scripts can build the local models checkout and emit npm-installable tarballs:

```bash
yarn pack:cli:release
```

The outputs are:

```text
preview/undefineds-co-models-<models-version>.tgz
preview/undefineds-co-linx-<cli-version>.tgz
```

The release pack script converts a local `packages/models` checkout from workspace metadata to package metadata and makes `apps/cli` depend on the exact `@undefineds.co/models` version from that checkout. This is a transition path until LinX release consumes the already-published models package directly.

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

Install the produced tarball into an isolated npm prefix before tagging or
uploading it:

```bash
node scripts/smoke-install-cli-release.mjs
```

This verifies that the CLI resolves `@undefineds.co/models` through normal npm dependency resolution instead of a workspace-only link. It also verifies the installed `@undefineds.co/drizzle-solid` package contains the compound URI template link-resolution fix required by the Pod chat/thread/message path. `linx --help` and `linx --version` passing is not enough for release readiness.

The required `@undefineds.co/drizzle-solid` runtime fix has two externally visible effects:

- Inserting a message with `message.chat` and `message.thread` resolves inverse links to concrete chat/thread IRIs.
- Generated triples must never contain unresolved template variables such as `{chat}`.

If the smoke script fails on the drizzle-solid check, release a fixed
`@undefineds.co/drizzle-solid` first and then rebuild the models and CLI
tarballs. Do not tag or publish `@undefineds.co/models` or `@undefineds.co/linx`
against a registry drizzle-solid version that still only replaces `{id}` in
linked resource templates.

## Bundled Pi Plugins

The CLI release package may vendor Pi plugins that must ship with LinX-specific patches. Keep that list in:

```text
apps/cli/scripts/bundled-pi-plugins.mjs
```

To copy a specific plugin into a package staging root:

```bash
node apps/cli/scripts/bundled-pi-plugins.mjs --target-root /tmp/linx-cli-package pi-web-access
```

`pack-release.mjs` and `pack-preview-selfcontained.mjs` use the same helper, so release and preview packages share one plugin manifest. For `pi-web-access`, the helper also verifies the packaged source no longer points at `~/.pi/web-search.json` or `~/.linx/pi-web-access.json` and derives its config path from `LINX_HOME` / `SOLID_HOME`.

## Production Pod Smoke Account

Production smoke scripts that write to a real Pod must use a dedicated smoke-test account, not a developer or customer account. The scripts refuse to run unless the active LinX login WebID exactly matches `LINX_PROD_SMOKE_WEBID`.

Recommended setup:

```bash
export LINX_PROD_SMOKE_WEBID=https://id.undefineds.co/<smoke-user>/profile/card#me
HOME=/tmp/linx-prod-smoke-home linx login
HOME=/tmp/linx-prod-smoke-home LINX_PROD_SMOKE_WEBID=$LINX_PROD_SMOKE_WEBID node scripts/verify-cli-pod-durable.mjs
```

The isolated `HOME` keeps the smoke account's `~/.solid/auth` credentials separate from the user's normal Solid auth store. `scripts/verify-cli-pod-durable.mjs` and `scripts/prod-pod-core-crud.mjs` are write smoke tests; they should never default to the currently logged-in personal account.

## Git Tag Release

Normal LinX CLI release is tag-driven:

```bash
git status --short
yarn pack:cli:release
node scripts/smoke-install-cli-release.mjs
git push origin <branch>
git tag linx-v<cli-version>
git push origin linx-v<cli-version>
```

The tag must match the CLI version in `apps/cli/package.json`. For example,
`apps/cli/package.json` version `0.3.3` is released with:

```bash
git tag linx-v0.3.3
git push origin linx-v0.3.3
```

Never reuse or force-move a release tag. Before tagging, check both local and
remote tags:

```bash
git tag --list "linx-v<cli-version>"
git ls-remote --tags origin "linx-v<cli-version>"
```

If the tag already exists, the current package version is not releasable as a
new release. Bump `apps/cli/package.json` to the next intended version, rebuild,
smoke-install, commit that version change, then tag the new version.

The `linx-v*` tag starts `.github/workflows/cli-release.yml`. That workflow
rebuilds, packs, smoke-installs, publishes the npm package from GitHub Actions,
and creates the GitHub Release. Publication should use npm Trusted Publishing
(OIDC) for `undefinedsco/LinX` + workflow filename `cli-release.yml`; npm token
publication can fail with `EOTP` when the token belongs to an account/package
that requires interactive 2FA. Keep the publish step free of `NODE_AUTH_TOKEN`
and token-backed npmrc setup so npm can use the GitHub OIDC identity. Local
machines do not need npm publish credentials for the normal release path.

## Manual npm Registry Publish

Manual npm publish is not the default release process. Use it only when a human
explicitly asks for a registry publish outside the tag workflow, and only after
the same pack and smoke-install verification has passed.

Publish models first, then CLI:

```bash
npm publish --access public preview/undefineds-co-models-<models-version>.tgz
npm publish --access public preview/undefineds-co-linx-<cli-version>.tgz
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

If a new models release depends on ORM behavior, registry publication order is:

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
@earendil-works/pi-coding-agent
yargs
```

Global install commands should include `--omit=peer`:

```bash
npm i -g --omit=peer @undefineds.co/linx
```

`@undefineds.co/models` depends on `@undefineds.co/drizzle-solid`, which depends on `drizzle-orm`. `drizzle-orm` publishes many optional peer dependencies for SQL/database adapters. LinX CLI does not need those adapters, and npm will otherwise auto-install them. Keep release verification and update prompts on the `--omit=peer` path unless CLI code starts importing those peer packages directly.

`@comunica/query-sparql-solid` is not a CLI product dependency. It belongs behind `@undefineds.co/models` because the CLI calls the shared profile/chat/session APIs, while models owns the Solid/drizzle-solid data access boundary. Do not add `@undefineds.co/drizzle-solid`, `@comunica/query-sparql-solid`, or `@inrupt/vocab-common-rdf` directly to the CLI package unless CLI code imports them directly.

The remaining install-time cost is mostly transitive:

- `@earendil-works/pi-coding-agent` brings the native Pi TUI/runtime stack.
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

It verifies the same release tarballs on Linux and macOS. Only the Linux
artifact is uploaded for the publish job. The normal trigger is a pushed
`linx-v*` git tag. Publishing runs in order:

```text
@undefineds.co/models -> @undefineds.co/linx
```

Automatic registry publish happens in GitHub Actions on tags matching `linx-v*`.
Manual `workflow_dispatch` can verify without publishing, or publish when
`publish=true`. npm publishing requires `NPM_TOKEN` in GitHub Actions secrets;
local developer/agent npm credentials are not part of the standard release
path.

## Shared Models Development

`@undefineds.co/models` should be versioned as the schema/API truth shared by xpod and LinX:

- Use semver for compatibility: patch for fixes, minor for additive schema/API, major for breaking schema/API.
- Publish models before publishing xpod or LinX releases that depend on new model APIs.
- Pin runtime packages to an exact models version for release artifacts. During migration, the generated CLI package reads the version from `packages/models/package.json`; the target shape is to read/verify the published version dependency directly.
- Do not maintain `packages/models` as a long-lived LinX submodule. Treat it as a temporary local checkout/link while the release scripts are being decoupled.
- Do not vendor models into production packages except for emergency preview builds.

The default community path should stay simple:

```bash
git clone <repo>
yarn install
yarn dev
```

Core developers who need to change shared model code should work in the independent models repository first:

```bash
git clone https://github.com/undefinedsco/models.git ../models
```

Then publish/tag models and update LinX to consume that exact version. If a temporary local workspace checkout/link is needed for development, keep that as local wiring and do not treat it as the source of truth.

`yarn models:status` shows whether `packages/models` is currently a workspace directory, submodule, or symlink. A submodule status means the checkout is still on the legacy migration path and should not be used as the recommended maintenance model.

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
