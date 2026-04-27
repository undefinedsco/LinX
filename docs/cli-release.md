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

Release tarballs force `repository.url` to `git+https://github.com/undefinedsco/LinX.git`. Keep this value aligned with the GitHub Actions publisher configured in npm Trusted Publishing, otherwise npm cannot bind the OIDC claim to the package.

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

CLI CI runs on Linux and macOS with Node 22:

```text
.github/workflows/cli-ci.yml
```

The supported Linux target includes WSL2 when LinX CLI is installed and run inside the WSL2 Linux environment. Windows native shells such as PowerShell and cmd are not part of the supported CLI/TUI release gate. The native Windows runner currently differs on terminal behavior, POSIX permission bits, shebang/PATH execution, and file-lock cleanup semantics; those are not release blockers for the supported macOS/Linux path.

The CI path builds models, builds CLI, runs CLI tests, packs release tarballs, and installs the tarballs into an isolated global npm prefix before running:

```bash
linx --help
linx --version
```

Release publishing is handled by:

```text
.github/workflows/cli-release.yml
```

It verifies the same release tarballs on Linux and macOS. Only the Linux artifact is uploaded for publish. Publishing runs in order:

```text
@undefineds.co/models -> @undefineds.co/linx
```

Automatic publish happens on tags matching `linx-v*`. Manual `workflow_dispatch` can verify without publish, or publish when `publish=true`.

npm publishing uses Trusted Publishing/OIDC, not a long-lived `NPM_TOKEN`. The npm CLI requires npm `>=11.5.1` and Node `>=22.14.0` for this path, so the publish job uses Node 24 while the product verification matrix remains on Node 22.

Configure Trusted Publishing on npm for both packages:

```text
@undefineds.co/models
@undefineds.co/linx
```

Use these GitHub Actions publisher fields on npm:

```text
Organization/user: undefinedsco
Repository: LinX
Workflow filename: cli-release.yml
Environment name: empty unless the workflow is changed to use a GitHub environment
```

The release workflow has top-level `id-token: write`; npm automatically detects the GitHub OIDC environment during `npm publish`. Do not set a real `NODE_AUTH_TOKEN` for the publish steps. The workflow explicitly clears `NODE_AUTH_TOKEN` during publish so an old repository `NPM_TOKEN` cannot make npm fall back to token-based publishing. If publish fails with `EOTP`, the workflow is still using token-based publishing or the npm package has not been configured for Trusted Publishing.

For an already-published package whose registry metadata points at an old repository, publish one corrected package version or update package metadata so the package repository matches `undefinedsco/LinX`. Trusted Publishing validates the package repository against the GitHub Actions claim.

## Shared Models Development

`@undefineds.co/models` should be versioned as the schema/API truth shared by xpod and LinX:

- Use semver for compatibility: patch for fixes, minor for additive schema/API, major for breaking schema/API.
- Publish models before publishing xpod or LinX releases that depend on new model APIs.
- Pin runtime packages to an exact models version for release artifacts. The generated CLI package uses `"@undefineds.co/models": "<same-version>"`.
- Keep `packages/models` as the repo-local `@undefineds.co/models` release source.
- Keep `packages/linx-models` as the `@linx/models` compatibility wrapper for app code that has not migrated yet.
- Do not vendor models into production packages except for emergency preview builds.

The default community path should stay simple:

```bash
git clone <repo>
yarn install
yarn dev
```

Core developers can edit shared model code directly in `packages/models`, then commit it with the consuming LinX/xpod changes:

```bash
cd packages/models
git add .
git commit -m "..."
```

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
