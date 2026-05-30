# LinX 桌面端 (含 xPod 内核) 架构设计

> 本文描述 Desktop 外壳、进程和本地 xpod 启动架构，不定义登录/存储语义。
> IDP/SP、注册、`solid:storage` 和业务写入规则以
> `docs/login-identity-storage-routing-model.md` 为准；Local canonical URL、
> tunnel、localhost/LAN 规则以 `docs/local-sp-domain-and-tunnel.md` 为准。

## 1. 概述

LinX 桌面端是面向用户的统一 AI 客户端，基于 Electron 构建。它不仅提供 AI 对话、文件管理等应用功能，还内置集成了 xPod 核心内核，使其能够作为本地数据节点运行。

### 1.1 核心定位

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LinX 桌面端核心定位                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────┐     ┌───────────────┐ │
│  │    AI 应用端    │     │   xPod 内核 (Local) │     │  运维与管理   │ │
│  │  ─────────────  │     │  ─────────────  │     │  ───────────  │ │
│  │  AI 聊天 (Chat) │     │  CSS 存储引擎   │     │  节点管理     │ │
│  │  文件管理 (Files)│     │  AI API 转换器  │     │  FRP 隧道     │ │
│  │  知识库 (Memory) │     │  本地数据安全   │     │  日志与终端   │ │
│  └─────────────────┘     └─────────────────┘     └───────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心价值

- **全能一体化**：用户只需下载一个 LinX，即可在“连云”和“存本地”模式间切换。
- **本地性能**：利用本地计算资源，AI 对话延迟更低。
- **隐私主权**：开启本地模式后，数据完全留在用户设备上，xPod 内核在后台静默运行。

---

## 2. 架构设计

### 2.1 整体架构

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           LinX Electron 桌面应用                           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                        渲染进程 (Renderer)                           │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │                    React 应用 (Unified UI)                    │   │  │
│  │  │                                                                │   │  │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐      ┌───────────────┐      │   │  │
│  │  │  │  Chat  │ │ Files  │ │ Memory │      │ Node Manager  │      │   │  │
│  │  │  │  Page  │ │  Page  │ │  Page  │      │   (Advanced)  │      │   │  │
│  │  │  └────────┘ └────────┘ └────────┘      └───────────────┘      │   │  │
│  │  │                                                                │   │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   │  │
│  │  │  │                     App Router                          │   │   │  │
│  │  │  └─────────────────────────────────────────────────────────┘   │   │  │
│  │  │                           │                                    │   │  │
│  │  │  ┌────────────────────────┼───────────────────────────────┐   │   │  │
│  │  │  │                    Zustand Store                        │   │   │  │
│  │  │  │  chatState, nodeState, configState, authState          │   │   │  │
│  │  │  └────────────────────────┼───────────────────────────────┘   │   │  │
│  │  └───────────────────────────┼───────────────────────────────────┘   │  │
│  └──────────────────────────────┼───────────────────────────────────────┘  │
│                                 │ IPC                                      │
│  ┌──────────────────────────────┼───────────────────────────────────────┐  │
│  │                        主进程 (Main Process)                          │  │
│  │  ┌───────────────────────────┼───────────────────────────────────┐   │  │
│  │  │                      IPC Handlers                              │   │  │
│  │  │  node:*, app:*, system:*, logs:*                              │   │  │
│  │  └───────────────────────────┼───────────────────────────────────┘   │  │
│  │                              │                                        │  │
│  │  ┌─────────────┐  ┌──────────┼───────┐  ┌─────────────┐             │  │
│  │  │ xPod Kernel │  │ Config   │       │  │ Log         │             │  │
│  │  │ Manager     │  │ Manager  │       │  │ Manager     │             │  │
│  │  │ ──────────  │  │ ──────── │       │  │ ──────────  │             │  │
│  │  │ CSS Core    │  │ node.json│       │  │ 日志聚合     │             │  │
│  │  │ API Core    │  │ .env     │       │  │ 日志轮转     │             │  │
│  │  │ frpc        │  │ acme     │       │  │ 日志搜索     │             │  │
│  │  └──────┬──────┘  └──────────────────┘  └──────┬──────┘             │  │
│  │         │                                       │                     │  │
│  │  ┌──────┴───────────────────────────────────────┴──────┐             │  │
│  │  │                    System Bridge                     │             │  │
│  │  │  托盘 | 菜单 | 自启 | 通知 | 文件系统 | Shell        │             │  │
│  │  └─────────────────────────────────────────────────────┘             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  CSS Core     │    │  API Core     │    │  frpc         │
│  (Child Proc) │    │  (Child Proc) │    │  (Child Proc) │
└───────────────┘    └───────────────┘    └───────────────┘
```

### 2.2 产品入口与本地运行能力

Desktop 外壳只关心是否需要启动本机 xpod。具体 IDP/SP 绑定、Pod
选择和业务写入 base 不在本文重复定义。

| 入口 | 是否启动本地 xpod | Desktop 外壳职责 |
|------|------------------|---------|
| **Cloud** | 否 | 打开普通 Solid/OIDC 登录流程。 |
| **Local** | 是 | 启动本机 xpod，并把启动/provisioning 状态交给 Web 登录层。 |
| **Standalone** | 是 | 启动本机 xpod，并打开本机账号流程。 |
| **Custom** | 否 | 让 Web 登录层使用用户填写的第三方 Solid provider。 |

规则：

- Local 和 Standalone 都会启动本机 xpod，但身份/存储语义不在 Desktop 架构文档定义。
- Local 的 canonical SP URL、canonical domain 策略、tunnel 和 same-node route
  优化见 `docs/local-sp-domain-and-tunnel.md`。
- LinX Desktop 产品层只使用 Cloud / Local / Standalone / Custom。

### 2.3 各端支持

| 端 | Cloud | Local | 说明 |
|---|---|---|---|
| **Web** | ✓ | ✓ | Local 需连接已经运行的 xpod；Web 不启动本地进程 |
| **Desktop** | ✓ | ✓ | 可启动内置 xpod 核心 |
| **Mobile** | ✓ | ✗ | 手机不运行 xpod，但可连接 PC 上的 xpod |

> **注**：Mobile 连接 PC 桌面版的 xpod 时，是访问一个远程 Storage Provider；不改变该 SP 的 canonical URL 或 `solid:storage` 绑定。

### 2.4 项目结构

```
linx/
├── apps/
│   ├── web/                # Web 应用 (Vite + React)
│   └── mobile/             # Mobile 应用 (Capacitor)
├── desktop/                # Desktop 应用 (Electron)
│   ├── src/
│   │   ├── main.ts         # 主进程：窗口、托盘、IPC、Supervisor
│   │   └── preload.ts      # 预加载：暴露 xpodDesktop API
│   ├── package.json
│   └── tsconfig.json
├── lib/
│   └── supervisor/         # 进程管理器（跨项目共享）
│       ├── Supervisor.ts   # 子进程生命周期管理
│       ├── types.ts        # ServiceConfig, ServiceState
│       └── index.ts
├── packages/
│   └── client/             # LinX 客户端 helper (@linx/client)
└── docs/
    ├── desktop-architecture.md
    └── linx-xpod-design.md
```

---

## 3. 主进程设计

### 3.1 Supervisor 进程管理

Desktop 使用 `lib/supervisor` 管理 xPod 子进程的生命周期：

```typescript
// lib/supervisor/types.ts
interface ServiceConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

type ServiceStatus = 'stopped' | 'starting' | 'running' | 'crashed';

interface ServiceState {
  name: string;
  status: ServiceStatus;
  pid?: number;
  startTime?: number;
  uptime?: number;
  lastExitCode?: number;
  restartCount: number;
}
```

```typescript
// desktop/src/main.ts
import { Supervisor } from '../../lib/supervisor';

const supervisor = new Supervisor();

// 注册 xpod 服务
supervisor.register({
  name: 'xpod',
  command: 'node',
  args: ['dist/index.js'],
  cwd: XPOD_ROOT,
  env: { NODE_ENV: 'production' },
});

// 启动所有服务
supervisor.startAll();
```

### 3.2 IPC 通信

渲染进程通过 preload 暴露的 API 与主进程通信：

```typescript
// desktop/src/preload.ts
contextBridge.exposeInMainWorld('xpodDesktop', {
  supervisor: {
    getStatus: () => ipcRenderer.invoke('supervisor:status'),
    start: (name: string) => ipcRenderer.invoke('supervisor:start', name),
    stop: (name: string) => ipcRenderer.invoke('supervisor:stop', name),
    restart: (name: string) => ipcRenderer.invoke('supervisor:restart', name),
    onStatusChange: (callback) => {
      ipcRenderer.on('service-status', (_event, data) => callback(data));
    },
  },
});
```

### 3.3 托盘功能

桌面端支持系统托盘常驻，服务在后台持续运行：

```typescript
// 托盘菜单
const contextMenu = Menu.buildFromTemplate([
  { label: '打开 Xpod', click: () => mainWindow.show() },
  { type: 'separator' },
  {
    label: '服务状态',
    submenu: [
      { label: '启动服务', click: () => supervisor.start('xpod') },
      { label: '停止服务', click: () => supervisor.stop('xpod') },
      { label: '重启服务', click: async () => { /* ... */ } },
    ],
  },
  { type: 'separator' },
  { label: '退出', click: () => app.quit() },
]);
```

---

## 4. 渲染进程设计 (Unified UI)

LinX 桌面端采用单一入口 React 应用，通过路由切换功能模块。

### 4.1 页面划分

1. **App 视图**：
   - **Chat**: 核心 AI 对话界面。
   - **Files**: Pod 文件管理器。
   - **Memory**: 知识库与长期记忆。

2. **管理视图 (Node Manager)**：
   - **Status**: 本地节点状态、健康度。
   - **Networking**: 隧道端口、公网访问配置。
   - **Advanced**: 日志流、终端。

---

## 5. 开发路线图

1. **LinX 应用集成**：将 LinX Web 应用源码引入并适配 Electron 环境。
2. **xPod 内核封装**：将 CSS 和 API 服务器封装为可被 Electron 调用的子进程模块。
3. **统一认证**：实现桌面端本地身份与 Pod 的无缝认证衔接。
4. **托盘与后台化**：确保内核在后台持续运行，LinX 应用可随时唤起。
