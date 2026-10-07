# LinX 登录路径索引与历史决策

状态：2026-09-28 R6 对齐。本文是入口索引及历史记录，**不再是三入口首页或单账号恢复的实施依据**。当前 UI 权威为[紧凑登录与绑定 Spec](login-modal-local-binding-spec.md)，产品恢复规则为[联合体验 R6](../../homepage/docs/specs/personal-ai-product-experience-r6.md)。对应 LS-09、10、11。

## 当前权威与分工

| 内容 | 权威 |
|---|---|
| 注册/登录/Consent 不创建、管理页显式创建与续接 | [Xpod 登录与宿主 canonical 第一部分 §0、第二部分 §4.1–4.2](../../xpod/docs/superpowers/specs/2026-09-19-xpod-login-and-host-design.md) |
| 紧凑登录、记住账号、undefineds Cloud/Local、部分就绪与退出恢复 | [登录主 Spec](login-modal-local-binding-spec.md) |
| IDP/SP、注册、solid:storage、业务写入位置 | [身份与存储路由](login-identity-storage-routing-model.md) |
| Local canonical domain、tunnel、localhost/LAN | [Local 域名与通道](local-sp-domain-and-tunnel.md) |
| 多地址探测与 same-node 访问优化 | [多渠道访问](multi-channel-access.md) |
| 草稿、账号切换、服务设置 | [Profile/Settings](prototype/module-profile-settings.md) |

## 当前入口与选择

| 情况 | 用户看到什么 | 必须保留的边界 |
|---|---|---|
| 记住的账号/空间绑定 | 账号头像、空间标签、继续/重新登录/切换账号 | 不再要求选 Cloud/Local；更改绑定要重新授权 |
| 首次 undefineds | 云端空间/本机空间，之后继续登录 | Local 是 Cloud 身份+本机存储；Cloud 是云端存储，不凭此声称同步 |
| 其他已配置 provider | provider 自己的登录与默认绑定 | 不展示 undefineds 空间选择，不在首屏列品牌目录 |
| Standalone | “其他登录方式”中的本机独立空间，运行时支持才可继续 | 本机身份+授权+存储；不是 Local 失败降级，不与云端/本机并排做三个主选项 |

账号来源、存储身份与访问渠道分开。Local 的本机/LAN/tunnel 不是三个空间；换渠道不改 canonical storage 或 WebID。不能从 Cloud WebID origin、issuer、localhost/LAN 地址推导业务写入位置。

## 关键路径与失败恢复

- Cloud：完成 Account 登录/注册（注册只建 Account）→ 读取权威 Pod 清单；已有可用 Pod 则选择/验证并续接授权，无 Pod 则进入 Account/Pod 管理。明确点击创建才提交；完成授权并验证绑定后恢复 LinX 合法上下文。不启动本机 xpod。
- 首次 Local：保留本机目标意图 → 完成 Account 登录/注册 → 读取权威 Pod 清单。无可用 Pod 则前往管理页；用户选定有管理权的本机目标、按需明确启动服务并确认创建后，才走既有 Local prepare/provisionCode/创建任务。完成后读取权威 owner/solid:storage，续接仍有效的原授权，再验证绑定和访问。登录、注册、Consent、callback 和进入管理页不 prepare、不创建；provisionCode 只是选定 Local 目标的签发证明，不是自动创建触发器。
- 记住的 Local：用户点继续才 ensure runtime，复用或重登 session，核对原绑定；打开登录弹窗只做轻量探测。
- Standalone：依本机身份合同完成 Account 登录/注册与独立的显式 Pod 管理，再完成所需授权；零 Pod 不阻塞 Account 成功，不走 Cloud provisioning。入口能力检查和路由映射由身份负责人落实，不从名称猜接口。
- 第三方 provider：依其已配置身份/存储合同验证；不沿用旧稿“所有 issuer 和 storage 必须同一 URL”的泛化限制。

清单读取失败与确认无 Pod 分开，失败时不当成零 Pod、不触发创建。注册成功和 Pod 创建失败分别反馈，后者不抹掉 Account 成功。绑定不明或冲突时阻断业务写入，返回原账号/空间恢复，不静默迁移或回退 Cloud。渠道故障与身份故障分别提示。创建超时/结果未知先查询原任务和权威清单，不能重放已提交创建。

授权无可用 Pod 提供“前往 Pod 管理”和“取消授权”；进入管理不等于同意创建。返回时核对 Account、原 interaction 的时限和健康；换号/过期重新授权。取消等待不撤销已提交任务，取消授权不撤销 Account 注册。

## 登录后不是全局 ready

已登录、空间读写、助手初始化、模型连接、个人模型各自有状态；缺个人模型是正常状态。可合法读取的内容不因 AI 连接失败消失；无权限时也不能展示旧缓存。初始化重试复用已有资源。

首次无上下文进入工作；返回用户恢复同一身份/空间下最后合法的会话、知识、方法或评估。人际聊天不要求任务对象。切换账号前处理草稿，切换开始后隔离旧内容/订阅；退出不等于停止远端 Run。

## 历史决策：不用于新实现

下列内容保留为背景，已被紧凑登录主 Spec 和 R6 替代：

- 旧稿把 Cloud / Local / Standalone 列为三个平级主入口；现改为 provider-first、undefineds 两种存储选择、高级 Standalone。
- 旧稿“当前 MVP 单账号恢复，多账号记忆为后续增强”不再约束设计；现以记住账号绑定与明确切换为合同。
- 旧稿以登录后进入 `/chat` 作为完成；现以绑定正确、分项就绪和恢复合法上下文判断。
- 旧稿将 Custom 的 issuer 与 storage 统一断言为同一个 URL；现在依身份/存储路由主文档核验，界面不自造约束。

历史记录记载 2026-05-10 增加 Cloud 回归、2026-05-11 Cloud 与 Local tunnel 路径通过，以及 2026-05-06 临时 tunnel 验证。这些是当时记录，**本轮没有重跑，不能证明当前版本、Standalone 或 R6 新状态已经可用**。旧临时域名和历史启动命令不作为当前操作指南。

## 实施验收入口

逐项使用登录主 Spec 第 10 节，并覆盖：记住绑定继续、首次 Cloud/Local、支持/不支持 Standalone、注册零 Pod 且无 prepare/create、清单失败不当零 Pod、显式创建/未知结果恢复、注册成功与创建失败隔离、管理后授权续接、过期 scope、绑定冲突、空间不可达、读写分离、助手部分就绪、无模型、退出草稿、跨身份晚到结果和原上下文恢复。提供实际状态与写入目标证据；本索引不替代协议测试。
