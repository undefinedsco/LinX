# Legacy Notice

`packages/models` 已退役，不再承载共享数据面源码。

当前权威源：

- 共享数据面 SDK：`@undefineds.co/models`
- LinX 仓内客户端入口：`packages/client`（发布为 `@linx/client`）

如果你在 LinX 仓内看到旧文档仍引用 `packages/models`，请按下面规则理解：

- `schema` / `namespaces` / shared types：迁移到 `@undefineds.co/models`
- LinX 专属本地账号 / `watch` 客户端层：保留在 `@linx/client`

不要再向这个目录添加源码或测试。
