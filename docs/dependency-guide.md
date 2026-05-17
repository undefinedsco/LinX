# Dependency Guide

这个文档是 LinX 仓库的依赖入口。凡是涉及 workspace 依赖、submodule、npm package 版本、发版产物、`xpod` 或 `models` 升级，都先读这里。

它是本仓库工程约束，不属于 Solid modeling skill 的临时判断范围。

## 触发场景

- 改 `package.json`、`yarn.lock`、workspace dependency 或 release dependency。
- 升级 `@undefineds.co/xpod`、`@undefineds.co/models`、`@undefineds.co/drizzle-solid` 这类共享基础依赖。
- 更新 `packages/models` submodule 指针。
- 打包 CLI/App，或准备发布需要依赖版本一致的产物。
- 补共享 schema、vocab、repository、runtime contract 或跨端 helper。

## 依赖形态

- `packages/models` 在 LinX 仓库中作为 git submodule 使用。
- `apps/web` 和 `apps/cli` 通过 workspace 依赖 `@undefineds.co/models`，但 release artifact 必须依赖发布后的精确 npm 版本。
- `@undefineds.co/models` 是跨端 schema、vocab、repository、runtime contract 和轻量 client helper 的 authority。

## 版本锁定规则

父仓库锁定的 `packages/models` submodule commit 必须和 `packages/models/package.json` 的版本一致：

1. `packages/models/package.json` 版本为 `X.Y.Z`。
2. submodule 当前 commit 必须精确命中 tag `vX.Y.Z`。
3. 不要把 LinX 父仓库锁到 `vX.Y.Z-N-g<sha>` 这类 tag 后提交。
4. 如果 models 有新 commit 但还没有对应 tag，不要更新父仓库 submodule 指针；先在 models 仓库完成版本号、tag 和发布流程。

检查命令：

```bash
git submodule status packages/models
git -C packages/models describe --tags --exact-match HEAD
node -p "require('./packages/models/package.json').version"
```

期望：

```text
git tag: vX.Y.Z
package version: X.Y.Z
```

## 更新流程

当 models 有新版本时：

1. 在 `packages/models` 拉取远端 tag。
2. checkout 到与 package version 对应的 tag，例如 `v0.2.21`。
3. 在 LinX 父仓库提交 submodule 指针变更。
4. 运行至少：

```bash
yarn models:assert-release-safe
yarn build:models
```

如果改动会影响 App 或 CLI 的实际调用，再运行对应 workspace 的 build/test。

## 禁止事项

- 不要为了“拿最新”把父仓库锁到 models `main` 的非 tag commit。
- 不要在 LinX `apps/*` 中复制 models 已有的跨端业务语义。
- 不要在 LinX 内部绕开 `@undefineds.co/models` 重新定义 schema、vocab、repository 或 shared helper。
- 不要把 provider/model/credential 的跨端语义直接散落到 UI 或 CLI 壳层；缺少 contract 时先补 models 并发布对应版本。

## 当前基线

当前 LinX 父仓库应锁定：

```text
packages/models package version: 0.2.24
packages/models commit: acaa6064eea261d00d25377a40f6e27583e77432
packages/models tag: pending v0.2.24
```
