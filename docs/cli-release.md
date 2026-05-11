# LinX Release

LinX uses one product version line across CLI and app shells. The current automatic npm release path in this repository publishes the CLI package only:

```text
@undefineds.co/linx
```

The shared data model package is `@undefineds.co/models`. It is the schema/API truth shared by LinX and xpod, but it is no longer built from this repository. Publish `@undefineds.co/models` in its own release pipeline before publishing a LinX or xpod build that depends on new model APIs.

## Current Release Path

Build the private `@linx/client` workspace, build the CLI, and emit one npm-installable tarball:

```bash
yarn pack:cli:release
```

The output is:

```text
preview/undefineds-co-linx-<version>.tgz
```

The release pack script vendors the private `@linx/client` build into the CLI tarball and rewrites `@linx/client` imports to relative `vendor/client` imports. Published packages must not depend on private workspace packages.

The CLI still depends on the published `@undefineds.co/models` package through normal npm dependency resolution. Do not bump that dependency unless the matching models version already exists on npm.

## Local Verification

Install the produced tarball into an isolated npm prefix before publishing or uploading it:

```bash
node scripts/smoke-install-cli-release.mjs
```

This verifies that the CLI can be installed globally from the release tarball, resolves `@undefineds.co/models` from npm, and includes the required `@undefineds.co/drizzle-solid` runtime patch. `linx --help` and `linx --version` passing is not enough for release readiness.

The required `@undefineds.co/drizzle-solid` runtime fix has two externally visible effects:

- Inserting a message with `message.chat` and `message.thread` resolves inverse links to concrete chat/thread IRIs.
- Generated triples must never contain unresolved template variables such as `{chat}`.

If the smoke script fails on the drizzle-solid check, publish a fixed `@undefineds.co/drizzle-solid` first, publish a compatible `@undefineds.co/models` if needed, and then rebuild the CLI tarball.

## npm Registry Publish

Publish the CLI tarball:

```bash
npm publish --access public preview/undefineds-co-linx-<version>.tgz
```

After registry publication, users install:

```bash
npm i -g @undefineds.co/linx
```

If a new CLI release needs new shared model APIs, publish order is:

```text
@undefineds.co/drizzle-solid -> @undefineds.co/models -> @undefineds.co/linx
```

Skip the models step when the CLI continues to use an already-published models version.

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

Current direct CLI runtime dependencies include:

```text
@undefineds.co/models
@inrupt/solid-client-authn-node
@mariozechner/pi-coding-agent
@zed-industries/codex-acp
yargs
```

`@linx/client` is a private workspace helper and is vendored into the CLI release tarball. Do not publish it as a runtime dependency unless it becomes a public package.

`@comunica/query-sparql-solid` is not a CLI product dependency. It belongs behind `@undefineds.co/models` because the CLI calls the shared profile/chat/session APIs, while models owns the Solid/drizzle-solid data access boundary. Do not add `@undefineds.co/drizzle-solid`, `@comunica/query-sparql-solid`, or `@inrupt/vocab-common-rdf` directly to the CLI package unless CLI code imports them directly.

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

## CI/CD

CLI CI runs on Linux and macOS with Node 22:

```text
.github/workflows/cli-ci.yml
```

The supported Linux target includes WSL2 when LinX CLI is installed and run inside the WSL2 Linux environment. Windows native shells such as PowerShell and cmd are not part of the supported CLI/TUI release gate.

The CI path builds `@linx/client`, builds CLI, runs CLI tests, packs the release tarball, and installs the tarball into an isolated global npm prefix before running:

```bash
linx --help
linx --version
```

CLI npm publishing is handled by:

```text
.github/workflows/cli-release.yml
```

It verifies the same release tarball on Linux and macOS. Only the Linux artifact is uploaded for publish. Automatic CLI npm publish happens on product release tags matching `v*`. Manual `workflow_dispatch` can verify without publish, or publish when `publish=true`.

The legacy Web/Desktop GitHub release workflow is currently manual-only. Keep it off automatic `v*` tags until the app artifacts are ready to ship on the same product version line. When app release is ready, attach those jobs to the same `v*` tag flow instead of introducing a separate app version stream.

npm publishing uses the GitHub Actions secret `NPM_TOKEN`. The token must have publish access to the `@undefineds.co` scope and must be allowed to bypass publish-time 2FA. `@undefineds.co/linx` does not need to pre-exist; the first successful `npm publish --access public` creates the package.

If publish fails with `EOTP`, the token is still subject to one-time-password verification. If publish fails with `E403` or `E404`, the token does not have publish permission for the target package or scope.

## Shared Models Development

`@undefineds.co/models` should be versioned as the schema/API truth shared by xpod and LinX:

- Use semver for compatibility: patch for fixes, minor for additive schema/API, major for breaking schema/API.
- Publish models before publishing xpod or LinX releases that depend on new model APIs.
- Pin runtime packages to an exact published models version for release artifacts.
- Do not reintroduce `packages/models` as a source package in this repository.
- Do not vendor models into production packages except for emergency preview builds.

The default community path should stay simple:

```bash
git clone <repo>
yarn install
yarn dev
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

If the domain hosts a tarball, the endpoint should serve the CLI tarball only after the referenced `@undefineds.co/models` version is already published to npm. Otherwise npm cannot satisfy the CLI dependency from the registry.
