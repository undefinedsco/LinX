# 本地 Pod 部署设计

这份文档是本地 Pod 相关文档索引，不再作为 Local 语义主文档。

主文档：

- Local canonical URL、canonical domain 策略、tunnel、localhost/LAN：`docs/local-sp-domain-and-tunnel.md`
- IDP/SP、注册、`solid:storage`、业务写入边界：`docs/login-identity-storage-routing-model.md`
- 登录产品流程和验收：`docs/login-experience-map.md`
- 多渠道访问和 same-node 探测：`docs/multi-channel-access.md`

## 本文件职责

本文只作为本地 Pod 文档索引和职责摘要。不要在这里新增 Local/Standalone
身份语义、registration flow、`solid:storage` 规则或 canonical URL 规则；需要修改时改主文档。

## 分工摘要

LinX 负责启动 xpod、采集本地配置、调用 Cloud provisioning、展示运行状态和执行 same-node route 探测。

xpod 负责 Pod 创建、数据持久化、root/onboarding 入口、候选访问地址和 canonical URL 对外声明。

Cloud 负责 Cloud 账号、登录、consent、Cloud-managed canonical URL 分配和 provision scope 校验；具体 profile/storage 绑定规则见登录主文档。
