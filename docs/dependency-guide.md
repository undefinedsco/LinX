# Dependency Guide

这个文档是 LinX 仓库的依赖入口。凡是涉及 workspace 依赖、npm package 版本、发版产物、`xpod` 或 `models` 升级，都先读这里。

它是本仓库工程约束，不属于 Solid modeling skill 的临时判断范围。

## 触发场景

- 改 `package.json`、`yarn.lock`、workspace dependency 或 release dependency。
- 升级 `@undefineds.co/xpod`、`@undefineds.co/models`、`@undefineds.co/drizzle-solid` 这类共享基础依赖。
- 调整本地 `models` 开发检出、workspace/link 方式或迁移旧 submodule。
- 打包 CLI/App，或准备发布需要依赖版本一致的产物。
- 补共享 schema、vocab、repository、runtime contract 或跨端 helper。

## 依赖形态

- `@undefineds.co/models` 是跨端 schema、vocab、repository、runtime contract 和轻量 client helper 的 authority。
- `@undefineds.co/models` 的源码权威在独立 models 仓库，技能 `solid-modeling` 也随该包/插件发布。
- LinX release artifact 必须依赖发布后的精确 npm 版本，不以 LinX 仓内的 `packages/models` 脏工作区作为发布权威。
- 当前 `packages/models` 若存在，只能视为迁移期的本地开发检出；它不再是推荐长期形态，也不应作为 LinX 内部 submodule 维护入口。
- 本地开发如果需要改共享模型，优先在独立 models 仓库完成提交、版本和发布，再让 LinX 消费对应版本。开发期 workspace/link 只是便捷接线，不改变权威归属。

## 发布口径

这里的“发布”默认指 git release path：提交、推送、打版本 tag，让 CI/CD
用仓库凭证完成 registry/npm 侧动作。不要把用户或文档里的“发布 / 发版 /
publish”自动理解为在本机执行 `npm publish`。

- 本地 agent 可以做：提交、验证、打包、本地安装冒烟、准备 tag 命令。
- 正常 release 入口：push git commit + push release tag。
- npm registry publish：由 GitHub Actions 等发布流水线执行；只有用户明确要求
  “手工 npm publish / registry publish” 时，本地才考虑执行。
- 发布前发现本机 npm token 失效，不是标准 release blocker；标准 blocker 是
  git 状态、版本号、tag、CI 发布权限或 release workflow 配置错误。

## 版本锁定规则

发布产物必须锁定到一个明确的 `@undefineds.co/models` 版本：

1. models 独立仓库先完成 schema/API 修改、测试、版本号和 release tag；npm registry 发布由对应 release 流水线完成。
2. LinX 再升级 `@undefineds.co/models` 依赖到该精确版本，并更新 lockfile / release 脚本需要的版本来源。
3. 不要把 LinX 父仓库的 git 状态当成 models 版本证明。
4. 如果本地 `packages/models` 正好是 submodule，那是旧布局兼容；不要提交新的 submodule 指针作为共享模型升级方案。

检查命令：

```bash
yarn models:status
node -p "require('./packages/models/package.json').version"
```

期望是能够清楚回答两件事：

```text
models package version: X.Y.Z
LinX release dependency: @undefineds.co/models@X.Y.Z
```

## 更新流程

当 models 有新版本时：

1. 在独立 models 仓库完成修改、测试、tag，并确认 release 流水线完成 registry 发布。
2. 在 LinX 仓库升级 `@undefineds.co/models` 到发布后的精确版本。
3. 运行至少：

```bash
yarn models:assert-release-safe
yarn build:models
```

如果改动会影响 App 或 CLI 的实际调用，再运行对应 workspace 的 build/test。

## 禁止事项

- 不要为了“拿最新”把 LinX 接到 models `main` 的未发布脏状态。
- 不要在 LinX 仓库里把 `packages/models` 当成长期 submodule 维护。
- 不要只提交 LinX 父仓库指针来表达共享模型升级；共享模型修改必须先进入 models 独立仓库。
- 不要在 LinX `apps/*` 中复制 models 已有的跨端业务语义。
- 不要在 LinX 内部绕开 `@undefineds.co/models` 重新定义 schema、vocab、repository 或 shared helper。
- 不要把 provider/model/credential 的跨端语义直接散落到 UI 或 CLI 壳层；缺少 contract 时先补 models 并发布对应版本。

## 当前基线

当前状态是迁移期：

```text
@undefineds.co/models package version: 0.2.45
@undefineds.co/drizzle-solid package version: 0.3.17
@undefineds.co/xpod package version: 0.3.52
packages/models: legacy local checkout/submodule if present
target: remove submodule maintenance path and consume the published models package/version
```
