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

打包时会将桌面专用的 `apps/web/dist-desktop` 复制到应用的 Resources 目录。不要再直接拿普通 `apps/web/dist` 给桌面壳使用，否则 `file://` 下会因为绝对资源路径而白屏。

Local / Standalone 启动采用 Bun-first 的按需 runtime 策略：

- 优先探测本机 `bun`，版本需满足 `LINX_MIN_BUN_VERSION`，默认 `>=1.3.0`
- 有 Bun 时，将 `@undefineds.co/xpod@<version>` 安装到 `LINX_HOME/runtimes/xpod/<version>/bun`
- 没有 Bun 时，回退到本机 `node` + `npm`，Node 版本需满足 `LINX_MIN_NODE_VERSION`，默认 `>=22.0.0`
- npm fallback 安装到 `LINX_HOME/runtimes/xpod/<version>/npm`
- `LINX_XPOD_VERSION` 可覆盖 xpod 版本；默认使用 LinX 根依赖中声明的精确 `@undefineds.co/xpod` 版本
- 不使用 `npm i -g`，不会污染用户全局 npm/bun 环境
- 开发态仍可用 `LINX_XPOD_ROOT` 指向本地 xpod checkout，或用 `LINX_XPOD_DEV_SOURCE=0` 禁用源码优先

当前过渡版本还会复制一份裁剪后的 `xpod` 本地运行资源，作为 Bun/npm 都不可用时的最后兜底。这个资源必须保持小体积：

- 不允许带 `node_modules`
- 不允许带 `dist/xpod-single.cjs` 或 `dist/xpod.single.cjs`
- 不允许带 `dist/npm`、测试工具、source map、声明文件或构建缓存
- 默认 `build/xpod-resource` 体积上限是 25 MB，可用 `LINX_DESKTOP_MAX_XPOD_RESOURCE_MB` 仅为本地实验临时调整
- 默认从 workspace/npm 的 xpod 位置取资源；本地调试可用 `LINX_DESKTOP_XPOD_RESOURCE_ROOT=/path/to/xpod` 显式指定来源
- 默认输出到 `build/xpod-resource`；测试或本地实验可用 `LINX_DESKTOP_XPOD_RESOURCE_OUTPUT_ROOT=/tmp/xpod-resource` 指定输出目录

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

`xpod` 的运行状态、日志、Pod 数据和 runtime 缓存都放在对应的 `LinX` userData 目录下；可用 `LINX_HOME` 统一改到自定义目录。
