# LinX Shell / Core Modeling Principles

本文档只定义 LinX 的 shell/core 建模边界。它不是功能说明书。

具体命令、字段、流程、验收、测试和实现细节必须写在对应功能文档里。

## Model

LinX 是共享 core 驱动的产品，不是一组端实现各自定义业务。

- Core 拥有产品语义、共享状态和跨端事实。
- Shell 负责交互、展示、启动、协议适配和本地可用性。
- 同一概念可以在不同 shell 有不同交互形态，但不能有不同业务含义。

## Ownership

判断一个概念归属时只看事实来源和语义边界。

- 跨端可见或跨端可修改的事实属于 core。
- 定义产品行为、状态机、权限或恢复语义的逻辑属于 core。
- 只服务单一端交互、展示、协议桥接或本地可用性的逻辑属于 shell。
- 本地缓存可以服务可用性，但不能成为与 core 并列的产品事实源。

如果一个概念需要被多个 shell 共享，它不应该只存在于某个 `apps/*` 内部。

## Boundary

Shell 应该把外部输入和 runtime 事件翻译成 core 能理解的领域意图，而不是在 adapter 中发明业务语义。

Core 应该让 shell 可替换：换一个端实现、运行时适配器或展示层，不应改变产品含义。

当上游 core 已经拥有某个通用 coding-agent 能力时，LinX shell 不重新实现同等能力。
Shell 只能注入 LinX 差异点，例如品牌、默认目录、默认 backend、Pod 登录、同步投影、auto
和 Symphony 控制。若 core 能力没有可复用 API，优先推动 core 暴露 action/service，而不是在
LinX shell 里复制一份局部实现。

会话控制入口跟 Pi 对齐：`--continue/-c`、`--resume/-r`、`--session <id|path>` 是公共语义。
LinX 不新增并列的 `sessions` 产品命令或 `--sessions` flag。

Shell 的全局命令和帮助属于 shell contract，不应被某个 backend 或 core 私有命令覆盖。
Backend 可以通过 adapter 暴露自己的命令说明，但必须作为当前 backend 的附加 section，
不能替代 LinX/Pi 壳层的 `/help`、会话控制和全局命令。

## Out Of Scope

这份文档不定义任何具体功能。

- 不列命令语义。
- 不列资源字段。
- 不列同步流程。
- 不列 UI 行为。
- 不列测试矩阵。
- 不列某个 backend 或 runtime 的适配细节。

如果某条规则需要提到具体功能名，它通常应该移到该功能自己的文档。

## Review Questions

- 这个概念的事实来源是谁？
- 这个状态是否跨端可见或可修改？
- 这段逻辑是在表达产品语义，还是只是在适配某个 shell？
- 如果换一个 shell，产品含义是否保持一致？

答案指向跨端、产品语义或事实权威时，应下沉到 core 或共享数据面。

## Related Documents

- `docs/local-first-pod-sync.md`: local-first runtime 接入共享 core 的同步建模。
- `docs/cli-app-shared-core.md`: CLI/App 共享数据面、模型和 service 边界。
