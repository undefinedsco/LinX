# LinX

LinX 是一个面向 Solid 的 AI-native 第二大脑。它以 React/Vite Web 端为核心，同时提供 Electron 桌面壳和 Capacitor 移动壳，让同一份体验覆盖多端。当前里程碑聚焦欢迎/开启体验：连接 Solid Pod、拉取个人资料，并把受控的共享记忆交到 AI 伙伴手里。

## 技术栈

- **Web**：React 18.3 + TypeScript + Vite 5，使用 `@tanstack/react-router`、React Query、Tailwind/CSS Modules，以及 `@openai/chatkit-react` 打造聊天体验。
- **Desktop**：Electron 32.x 壳，直接加载 `apps/web` 的构建产物。
- **Mobile**：Capacitor 6 壳，保持与 Web 同步，不做额外的原生分叉。
- **Solid & 数据层**：`@undefineds.co/models`（drizzle-solid + drizzle-orm）统一管理所有 Pod 读写；`@inrupt/solid-client(-authn)`、`@inrupt/solid-ui-react`、`@inrupt/vocab-common-rdf`、`@comunica/*` 提供会话和 SPARQL 支撑。
- **AI 能力**：模型供应方以插件的方式接入——默认提供一组配置，用户或开发者也可以通过 Discover 面板添加自建端点（如 Ollama）或第三方模型；RAG/Embedding 能力通过我们定制的 Pod 服务统一管理。
- **样式**：遵循 UI Style Guide（Solid 紫色渐变 + 玻璃态 + Inter 字体）。组件实现优先使用 Tailwind token + CSS Modules，避免在组件内部重新定义颜色或间距。

## Solid 数据访问约定

- 所有结构化数据（profile、contacts、sessions 等）必须通过 `packages/models` 中的仓储层访问；这些仓储内部使用 drizzle-solid，负责连接 Pod、注册数据源并生成 SPARQL。
- **禁止 UI 直接访问 Solid Dataset**：若查询失败，请修复仓储的 schema/权限/SPARQL，而不是在组件里调用 `getSolidDataset` 等快捷方法，以确保缓存和架构升级的一致性。

## 工作流与工具

- 包管理器：**Yarn 1.22**（根目录 `package.json` 已声明 `packageManager`）。
- Workspaces：`apps/*`, `packages/*`, `tests/*`, `examples/*`。
- 安装依赖（如不需要打 Electron 包，建议跳过二进制下载）：

  ```bash
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 yarn install
  ```

- Web 开发服务器：

  ```bash
  yarn workspace @linx/web dev
  ```

- Web 生产构建：

  ```bash
  yarn workspace @linx/web build
  ```

### 共享 Models 联调

普通贡献者不需要额外配置。推荐用 submodule 一次性拉齐共享 models：

```bash
git clone --recurse-submodules <repo>
yarn install
```

如果已经 clone 了仓库但没有初始化 submodule：

```bash
yarn models:update
```

核心开发者可以直接在 `packages/models` 修改共享 schema/API。提交时先提交 models，再提交宿主仓库的 submodule 指针：

```bash
cd packages/models
git add .
git commit -m "..."
cd ../..
git add packages/models
git commit -m "Update shared models"
```

发布前会自动检查，`packages/models` 是 submodule 且有未提交变更时 `yarn pack:cli:release` 会失败。

## 目录概览

- `apps/web`：React/Vite 主应用，所有业务模块放在 `src/modules/<feature>`。
- `apps/desktop`：Electron 壳工程，仅负责加载 Web 构建产物和适配桌面特性。
- `apps/mobile`：Capacitor 壳工程，与 Web 保持一致的 UI + 路由。
- `packages/models`：Solid 数据模型与仓储。
- `packages/shared-ui`：跨端复用的 UI 组件。
- `packages/utils`：通用工具与跨端 helper。
- `tests/unit`：单元测试目录，编写轻量、可重复的模块级测试。
- `tests/integration/playwright`：跨端集成与 parity 测试（Playwright）。
