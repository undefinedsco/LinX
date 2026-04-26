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
PREFIX="$(mktemp -d)"
npm i -g --prefix "$PREFIX" ./preview/undefineds-co-models-0.1.0.tgz ./preview/undefineds-co-linx-0.1.0.tgz
"$PREFIX/bin/linx" --help
```

This verifies that the CLI resolves `@undefineds.co/models` through normal npm dependency resolution instead of a workspace-only link.

## npm Registry Publish

Publish models first, then CLI:

```bash
npm publish --access public preview/undefineds-co-models-0.1.0.tgz
npm publish --access public preview/undefineds-co-linx-0.1.0.tgz
```

After registry publication, users install:

```bash
npm i -g @undefineds.co/linx
```

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
