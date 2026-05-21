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

## Models 修改入口

LinX 任务中需要修改 `@undefineds.co/models` 时，必须在本仓库的 submodule 工作区里改：

```bash
cd packages/models
```

不要绕到 sibling checkout（例如 `../models` 或 `~/develop/models`）里改完再试图同步回来。原因是 LinX 父仓库只能记录 `packages/models` 的 submodule commit 指针；如果实际改动发生在别的 checkout，很容易出现：

- LinX 里 `packages/models` 仍然是旧代码或 dirty patch；
- `models` 远端已经有 tag，但 LinX 子模块没有锁到这个 tag；
- 本地测试用了一个 checkout，CI/release 用了另一个 checkout；
- 父仓库提交了 submodule 指针，但没有包含真正的 models 改动。

可以用外部 `../models` 做只读参考、diff 对比或恢复历史，但 LinX 相关的 models 代码修改、测试、提交、tag、push 都应发生在 `packages/models` 这个 submodule checkout 内。

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

## Submodule 升级流程

`packages/models` 是独立 git 仓库。父仓库只能记录一个 submodule commit 指针，不能记录子模块内部的未提交 diff。

因此看到父仓库状态为：

```text
 m packages/models
```

只表示子模块 checkout 的内容或指针变化了，不表示这些改动已经进入 `models` 远端。凡是 LinX 任务需要修 bug、补 schema、改 repository、改 runtime contract，都必须先在 `packages/models` 这个 submodule 内完成修改、提交、版本、tag 和 push，再回到 LinX 父仓库更新指针。

### 需要修改 models 代码时

1. 进入 LinX 的 submodule 工作区，并确认是在 `packages/models` 里改：

   ```bash
   cd packages/models
   git rev-parse --show-toplevel
   git status -sb
   git diff --stat
   ```

   `git rev-parse --show-toplevel` 应该输出 `.../linx/packages/models`，而不是 `.../develop/models`。

2. 在 `packages/models/package.json` bump 到新的未发布版本。

   不要复用 npm 上已经存在的版本，也不要把同一个版本 tag 指到不同 commit。

3. 在 `packages/models` 内运行验证：

   ```bash
   yarn test:ci
   yarn build
   ```

4. 在 `packages/models` 内提交、打 tag、推送：

   ```bash
   git add <changed-files>
   git commit
   git tag vX.Y.Z
   git push origin HEAD:main
   git push origin vX.Y.Z
   ```

   不要从外部 checkout 复制一个 tag 过来后直接更新 LinX 指针；tag 对应的 commit 必须就是 `packages/models` 当前 HEAD。

5. 回到 LinX 父仓库，把 submodule 锁到刚才的 tag：

   ```bash
   cd ../..
   git -C packages/models fetch origin --tags
   git -C packages/models checkout vX.Y.Z
   git add packages/models
   git commit
   git push origin main
   ```

6. 最后确认父仓库没有 dirty submodule，且指针命中精确 tag：

   ```bash
   git status -sb
   git submodule status packages/models
   git -C packages/models describe --tags --exact-match HEAD
   node -p "require('./packages/models/package.json').version"
   yarn models:assert-release-safe
   ```

7. 如果 LinX 运行时依赖发布包而不只是 workspace/submodule，还要确认 npm 已发布：

   ```bash
   npm view @undefineds.co/models version
   ```

   只有 npm、tag、`packages/models/package.json`、LinX submodule 指针四者一致，才算 models 升级完成。

### 只消费 models 已发布新版本时

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
- 不要在 LinX 任务中绕过 `packages/models` 去 sibling checkout 修改 models，然后再手工搬运。
- 不要在 LinX `apps/*` 中复制 models 已有的跨端业务语义。
- 不要在 LinX 内部绕开 `@undefineds.co/models` 重新定义 schema、vocab、repository 或 shared helper。
- 不要把 provider/model/credential 的跨端语义直接散落到 UI 或 CLI 壳层；缺少 contract 时先补 models 并发布对应版本。

## 当前基线

当前 LinX 父仓库应锁定：

```text
packages/models package version: 0.2.33
packages/models commit: 0ce0e6b9b1120efe4b513c2ccc2ded7019e989d5
packages/models tag: v0.2.33
```
