# LinX Desktop

Electron 桌面应用，集成 xpod 作为本地 Solid Pod 服务器。

## 开发设置

```bash
# 1. 创建 xpod 符号链接（首次）
yarn link:xpod

# 2. 构建 xpod（首次或 xpod 代码变更后）
yarn build:xpod

# 3. 启动开发环境
yarn dev
```

## 架构

```
LinX Desktop
├── Electron Main Process
│   ├── Supervisor      # 进程管理器
│   ├── ConfigManager   # 配置管理（~/.config/LinX/.env）
│   └── Tray Menu       # 系统托盘
│
└── xpod (子进程)
    └── Solid Pod Server (localhost:3000)
```

## 打包

```bash
# 打包当前平台
yarn dist

# 指定平台
yarn dist:mac
yarn dist:win
yarn dist:linux
```

打包时会将 `vendor/xpod` 目录复制到应用的 Resources 目录。

## 目录结构

```
apps/desktop/
├── src/
│   ├── main.ts           # Electron 主进程
│   ├── preload.ts        # 预加载脚本
│   ├── lib/
│   │   └── config-manager.ts
│   └── pages/
│       └── config.html   # 配置页面
├── vendor/
│   └── xpod -> /path/to/xpod  # 符号链接（开发）
└── release/              # 打包输出
```

## 环境变量

xpod 的配置通过 ConfigManager 管理，存储在：
- macOS: `~/Library/Application Support/LinX/.env`
- Windows: `%APPDATA%/LinX/.env`
- Linux: `~/.config/LinX/.env`
