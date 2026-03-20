# LinX

Your AI secretary for user-owned memory.

LinX 是一个构建在 Solid Pod 之上的 AI-native 第二大脑。它给用户一个以聊天为中心的工作界面，让 AI 能理解、组织并操作共享记忆，同时把数据控制权留在用户自己手里。

LinX 的目标不是再做一个套了 LLM 的聊天框，而是把 AI 做成一个真正可长期协作的秘书。

## 为什么是 LinX

- **AI 秘书体验**：AI 不只是回答问题，而是长期记忆、协助整理、代表用户处理信息与任务。
- **用户拥有记忆**：共享记忆保存在 Solid Pod，而不是困在 SaaS 平台数据库里。
- **聊天优先**：用户通过对话来管理知识、任务和上下文，而不是在一堆分散表单之间来回切换。
- **多端一致**：同一套产品体验覆盖 Web、桌面和移动端。
- **Pod-native 架构**：数据、身份、权限和 AI 工作流从一开始就围绕 Solid 设计。

## LinX 想给人的感觉

### 1. 你的 AI 秘书

LinX 的核心体验更接近“有一个 AI 秘书”：

- 持续记住上下文
- 帮你整理输入的信息
- 在授权前提下处理你的数据
- 在你的边界之内行动

### 2. 你和 AI 共享的一份记忆

LinX 把 Pod 视为用户与 AI 的共享记忆层。AI 可以在这里理解和使用：

- 个人资料与身份数据
- 对话与消息
- 联系人和关系
- 文件与附件
- 结构化记忆与检索数据
- 后续接入的应用资源

### 3. 人、AI、数据在同一个界面里

LinX 的目标是减少上下文切换。对话、记忆、工具、运行时和授权，不应该散落在多个无关应用里。

### 4. 隐私不是补丁，而是架构

AI 越了解用户，就越有价值；但这只有在用户持续掌控数据与授权边界时才成立。Solid Pod 和 Pod-native 的访问模式不是实现细节，而是信任模型的一部分。

## 产品分层

LinX 处在整个栈的用户产品层：

- **xpod**：提供 Pod runtime、Solid 凭证、身份与服务基础设施
- **`@linx/models` / drizzle-solid**：提供类型化的 Pod 数据模型和仓储访问
- **LinX**：提供最终面向用户的聊天、记忆、多端体验和工作流界面

换句话说，LinX 是前门。它把 Pod-native 的身份、存储和 AI 服务，组织成用户每天真正能用的产品。

## 当前重点

当前阶段已经不只是 onboarding 骨架，主线正在沿着最小可用闭环推进：

- Solid Pod 登录与基础资料加载
- Web / Desktop / Mobile 共用一套主界面
- Chat-first 交互
- 对话与相关数据留档到 Pod
- 运行时会话与 worktree 绑定
- 远程聊天驱动运行时
- Inbox / Approval / Audit 主链路收敛

## 核心体验模块

### Chat

聊天是主入口。用户通过对话与 AI、联系人、群组以及后续 agent/runtime 交互。

### Memory

记忆不是外挂能力，而是产品核心。LinX 让 AI 能基于共享记忆理解用户上下文，而不是把每轮对话都当成孤立会话。

### Files and Data

LinX 面向 Pod 中的文件和结构化数据工作，而不是把 Pod 当成一个原始文件浏览器暴露给用户。

### Discover / Model Services

用户可以连接模型供应方、自托管端点和未来生态能力；这层能力会和 Pod 中的配置、凭据与服务状态保持一致。

### Settings / Authorization

设置、授权、审计和 inbox 会收敛成统一产品面，而不是分散的“开发者调试入口”。

## 平台范围

LinX 目标上是一款跨形态但一致的产品。

### Web

Web 是当前主产品面，也是迭代最快的环境。

### Desktop

桌面端使用 Electron 壳，承载 workstation / local-first 使用方式。

### Mobile

移动端当前使用 Capacitor 壳，围绕 Web 主界面提供轻量连续体验，不单独重写一套原生产品。

## 技术栈

- **Web**：React 18.3 + TypeScript + Vite 5，使用 `@tanstack/react-router`、React Query、Tailwind，以及 `@openai/chatkit-react`
- **Desktop**：Electron 32.x
- **Mobile**：Capacitor 6
- **Data**：`@linx/models`（drizzle-solid + drizzle-orm）统一管理 Pod 读写
- **Solid**：`@inrupt/solid-client(-authn)`、`@inrupt/solid-ui-react`、`@inrupt/vocab-common-rdf`、`@comunica/*`
- **AI / Runtime**：ChatKit 交互层 + 本地/远程 runtime 会话 + xpod 兼容服务集成

## Solid 数据访问约定

- 所有结构化数据（profile、contacts、chat、messages、approval、audit 等）都必须通过 `packages/models` 暴露的 schema / repository / collection 路径访问
- UI 不允许直接调用 `getSolidDataset` 之类的低层 API 绕过模型层
- 查询失败时，应该修正 schema、权限、SPARQL 或 repository，而不是在 UI 层做兜底分叉

## 快速开始

### 环境要求

- Node.js 22+
- Yarn 1.22.x

### 安装依赖

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 yarn install
```

### 启动 Web

```bash
yarn workspace @linx/web dev
```

### 构建 Web

```bash
yarn workspace @linx/web build
```

### 常用测试

```bash
yarn test
```

## 工作区结构

- `apps/web`：主 React/Vite 应用
- `apps/desktop`：Electron 壳
- `apps/mobile`：Capacitor 壳
- `apps/service`：本地服务进程 / xpod 兼容服务集成
- `apps/cli`：CLI 入口
- `packages/models`：Pod 数据模型、schema、repository
- `packages/shared-ui`：跨端共享 UI
- `packages/utils`：通用工具
- `tests/*`：单元、集成和端到端测试
- `examples/*`：独立样例与验证工程

## 开发原则

- 把 AI 特性当作完整产品工作流，而不是孤立 demo
- 保持 Web / Desktop / Mobile 行为一致
- 用模型层统一 Pod 读写
- 修 Pod 数据访问时，优先对齐 `drizzle-solid` 新的 Solid-first 语义：IRI / link / exact-target mutation，而不是退回成纯 SQL 式心智
- 不在 UI 层直接操作 Solid dataset
- 数据、授权、审计、运行时尽量沿同一条主线收敛

## 不是要做什么

LinX 不是：

- 一个只是在笔记应用里塞进 LLM 的壳
- 一个脱离用户数据主权的纯云聊天客户端
- 一个把 Pod 原始内部结构直接暴露给用户的文件浏览器
- 一个优先面向开发者、而不是优先面向终端用户的工具集合

LinX 要做的是：让 AI-native 的个人记忆系统，变得日常、可信、可长期使用。

## 文档

- `docs/phase-delivery-plan.md`：当前阶段路线与交付拆分
- `docs/architecture-comparison.md`：LinX 与其他方案的架构对比
- `docs/linx-service-architecture.md`：服务进程与客户端分层
- `docs/local-pod-design.md`：本地 Pod / 部署方向
- `docs/service-layer-guide.md`：Service 层设计约定
- `docs/ui-style-guide.md`：UI 风格规范
- `design/product-definition.md`：产品定义与定位

## License

Private / internal workspace.
