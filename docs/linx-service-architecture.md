# LinX Service Architecture

## 概述

LinX 采用"服务 + 客户端"架构，将 xpod（Solid Pod 服务）与 LinX 合并为一个常驻后台的服务进程。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                  LinX Service (常驻后台)                     │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   xpod 模块      │    │      Web Server 模块            │ │
│  │                  │    │                                 │ │
│  │  Solid Pod 服务  │    │  Vite Dev / Static Server      │ │
│  │  OIDC Provider   │    │  提供 LinX Web UI               │ │
│  │  端口 5737       │    │  端口 5173                      │ │
│  │                  │    │                                 │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    Tunnel 模块                           │ │
│  │                                                          │ │
│  │  Cloudflare Tunnel (可选)                                │ │
│  │  公网域名: xxx.pods.undefineds.co                        │ │
│  │                                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   系统托盘 UI                            │ │
│  │  - 状态显示                                              │ │
│  │  - 快捷操作                                              │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↑
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
         [浏览器]        [桌面 App]       [手机 App]
         直接访问        Electron 壳      Capacitor 壳
         localhost       包装 WebView     包装 WebView
```

## 组件说明

### 1. LinX Service (主进程)

单一 Node.js 进程，包含所有服务模块：

| 模块 | 职责 | 端口 |
|------|------|------|
| xpod | Solid Pod 服务器、OIDC Provider | 5737 |
| Web Server | LinX 前端静态文件服务 | 5173 |
| Tunnel | Cloudflare Tunnel 连接（可选） | - |
| Tray | 系统托盘 UI | - |

### 2. 客户端

客户端只是访问 LinX Service 的"壳"：

| 客户端 | 技术 | 说明 |
|--------|------|------|
| 浏览器 | - | 直接访问 http://localhost:5173 |
| 桌面 App | Electron | 托盘图标 + WebView |
| 移动 App | Capacitor | WebView 包装 |

### 3. 系统托盘

托盘菜单结构：

```
🟣 LinX
├── 打开 LinX                    → 打开浏览器/App
├── ─────────────────────────
├── Pod 状态
│   ├── 本地: http://localhost:5737
│   └── 公网: https://xxx.pods.undefineds.co (如有)
├── ─────────────────────────
├── 隧道
│   ├── ✓ 已连接 / ✗ 未配置
│   └── 配置隧道...
├── ─────────────────────────
├── 开机启动: ✓
├── 设置...
└── 退出 LinX
```

## 生命周期

### 安装

1. 下载 LinX 安装包
2. 安装到系统（/Applications/LinX.app 或 Program Files）
3. 首次启动引导：
   - 设置数据目录
   - 可选：配置公网域名
   - 注册开机启动

### 启动

```
系统启动
    ↓
LinX Service 自动启动 (launchd/systemd/Windows Service)
    ↓
├── 启动 xpod 模块
├── 启动 Web Server 模块
├── 启动 Tunnel 模块 (如已配置)
└── 显示托盘图标
    ↓
服务就绪，等待客户端连接
```

### 日常使用

```
用户点击托盘图标 / 桌面图标
    ↓
打开浏览器访问 http://localhost:5173
    ↓
LinX Web UI 加载
    ↓
通过 localhost:5737 与本地 Pod 交互
```

### 退出

- **关闭窗口** → 服务继续后台运行
- **托盘菜单 → 退出** → 完全停止服务

## 数据存储

```
~/Library/Application Support/LinX/     (macOS)
%APPDATA%/LinX/                         (Windows)
~/.config/linx/                         (Linux)
│
├── config.json                         # 服务配置
├── pod/                                # Pod 数据
│   ├── .internal/                      # 系统数据
│   └── data/                           # 用户数据
└── logs/                               # 日志
```

## 配置文件

```json
{
  "version": 1,
  "pod": {
    "port": 5737,
    "dataDir": "~/Library/Application Support/LinX/pod"
  },
  "web": {
    "port": 5173
  },
  "tunnel": {
    "enabled": true,
    "type": "undefineds",
    "subdomain": "my-pod",
    "token": "eyJ..."
  },
  "autoStart": true
}
```

## 首次启动流程

```
┌─────────────────────────────────────────┐
│           欢迎使用 LinX                  │
│                                          │
│  LinX 需要进行初始设置                    │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 数据目录                            │ │
│  │ ~/Library/Application Support/LinX │ │
│  │                          [浏览...] │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ☑ 开机时自动启动                        │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 公网访问 (可选)                     │ │
│  │                                     │ │
│  │ ○ 仅本地访问                        │ │
│  │ ● 申请免费域名 (xxx.pods.co)        │ │
│  │ ○ 使用自有域名                      │ │
│  └────────────────────────────────────┘ │
│                                          │
│              [开始使用 LinX]             │
│                                          │
└─────────────────────────────────────────┘
```

## 与现有代码的变更

### 移除

- `apps/desktop/` 中的复杂 xpod 管理逻辑
- Provider 选择中的"创建本地 Pod"流程（不再需要）

### 新增

- `apps/service/` - LinX 服务主进程
  - `src/main.ts` - 入口，启动所有模块
  - `src/tray.ts` - 系统托盘
  - `src/config.ts` - 配置管理
  - `src/setup.ts` - 首次启动引导
- 首次启动 Setup UI（可以是简单的 HTML 页面）

### 简化

- 登录流程：本地 Pod 就是默认 Provider，无需选择
- 不需要检测 xpod 状态，因为服务和 UI 是一体的

## 登录流程简化

由于 LinX Service 已包含 Pod，登录变得更简单：

```
用户打开 LinX
    ↓
检测是否已登录（有 session）
    ↓
├── 已登录 → 直接进入主界面
└── 未登录 → 显示登录界面
              ↓
         本地 Pod 作为默认选项
              ↓
         点击登录 → OIDC 流程 → 完成
```

Provider 选择器变为：
- 默认：本地 Pod (localhost:5737) ← 推荐
- 其他：可添加外部 Provider（solidcommunity.net 等）
