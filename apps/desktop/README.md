# LinX Desktop

Electron 桌面应用，负责控制和连接本机独立运行的 `xpod` 服务。

## 开发设置

```bash
# 1. 启动 Web 开发服务器并打开桌面壳
yarn dev

# 2. 使用桌面专用 Web 产物启动桌面壳
yarn start
```

## 架构

```
LinX Desktop
├── Electron Main Process
│   ├── Supervisor      # 前台辅助进程管理
│   ├── ConfigManager   # 配置管理（~/.config/LinX/.env）
│   └── Tray Menu       # 系统托盘
│
└── xpod (独立后台服务)
    └── Solid Pod Server (LinX 退出后继续运行)
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

打包时会将桌面专用的 `apps/web/dist-desktop` 和 `@undefineds.co/xpod` 一并复制到应用的 Resources 目录。不要再直接拿普通 `apps/web/dist` 给桌面壳使用，否则 `file://` 下会因为绝对资源路径而白屏。

## 目录结构

```
apps/desktop/
├── src/
│   ├── main.ts           # Electron 主进程
│   ├── preload.ts        # 预加载脚本
│   ├── lib/
│   │   └── config-manager.ts
└── release/              # 打包输出
```

## 环境变量

xpod 的配置通过 ConfigManager 管理，存储在：
- macOS: `~/Library/Application Support/LinX/.env`
- Windows: `%APPDATA%/LinX/.env`
- Linux: `~/.config/LinX/.env`

`xpod` 的运行状态、日志和单文件缓存也放在对应的 `LinX` userData 目录下。
