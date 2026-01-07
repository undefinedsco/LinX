# LinX 桌面端 (含 xPod 内核) 架构设计

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

### 2.2 运行模式

LinX 只有两种运行模式：

| 模式 | 数据存储位置 | AI 引擎 | 适用场景 |
|------|------------|---------|---------|
| **Cloud** | 远程 Pod（官方托管或自建 xPod Server） | 远程供应商 | 快速上手，跨设备同步 |
| **Local** | 本地 xPod 核心 | 本地 Ollama / 远程 | 隐私至上，完全掌控 |

### 2.3 各端支持

| 端 | Cloud | Local | 说明 |
|---|---|---|---|
| **Web** | ✓ | ✓ | Local 模式需连接本机运行的 xPod |
| **Desktop** | ✓ | ✓ | 可启动内置 xPod 核心 |
| **Mobile** | ✓ | ✗ | 手机不运行 xPod，但可连接 PC 上的 xPod |

> **注**：Mobile 连接 PC 桌面版的 xPod 时，从 Mobile 视角看仍是 Cloud 模式（连接远程 Pod），只是这个"远程"是用户自己的 PC。

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
│   └── models/             # 共享数据模型 (@linx/models)
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