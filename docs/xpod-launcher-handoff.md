# xpod Launcher 下沉改造需求（交付给 xpod 团队）

> 用途：将当前 LinX 内部的 xpod 启动编排能力，收敛到 xpod 官方实现；LinX 仅保留薄调用层。
> 日期：2026-02-10

## 1. 背景

目前 LinX 为了满足“产品内可本地启动 xpod”，在 `@linx/service` 中实现了启动封装（runtime 解析、进程拉起、ready 检测、状态聚合）。

该能力已跑通，但边界上更适合由 xpod 官方维护：

- xpod 的启动参数、模式语义、进程编排应由 xpod 自己定义
- LinX 不应长期维护 launcher 细节，避免与 xpod 漂移
- xpod 升级后，LinX 应无需同步改内部启动逻辑

## 2. 当前 LinX 侧实现（供参考）

LinX 当前涉及 xpod 启动的关键代码：

- `/Users/ganlu/develop/linx/apps/service/src/lib/xpod.ts`
- `/Users/ganlu/develop/linx/apps/service/src/lib/web-server.ts`
- `/Users/ganlu/develop/linx/apps/service/package.json`

当前行为摘要：

1. npm-first 解析 xpod 入口（`@undefineds.co/xpod` / `xpod`），找不到才 fallback 本地路径
2. 用 node 子进程启动 xpod，并传 `--mode --port --env`
3. 用 `/_gateway/status` + `HEAD /` 轮询 ready
4. LinX 暴露 `/api/service/start|stop|restart|status`

## 3. 目标边界（建议）

### 3.1 xpod 负责

- 官方启动契约（CLI 或 API）
- 进程生命周期（start/stop/restart）语义
- ready/health 判定语义
- 运行状态结构（建议标准化）

### 3.2 LinX 负责

- 采集用户配置并写入 `.env`
- 调用 xpod 官方启动契约
- 在 UI 里显示“运行状态 + 跳转 xpod 原生页面（`/app/`、`/dashboard/`）”
- 不复刻 xpod dashboard

## 4. xpod 侧期望交付（最低可用）

## 4.1 方案 A（推荐）：稳定 CLI 契约

提供并文档化稳定命令（示例）：

- `xpod run --env <path> --mode <local|cloud> --port <number>`
- `xpod status --env <path> --json`
- `xpod health --env <path> --json`

要求：

- `status --json` 输出稳定字段：
  - `running: boolean`
  - `baseUrl: string`
  - `publicUrl?: string`
  - `port: number`
  - `pid?: number`
- 退出码语义稳定（成功/失败可自动化判断）

## 4.2 方案 B：Node API（可选）

提供稳定 SDK 入口（示例）：

- `createXpodRunner({ envPath })`
- `runner.start()` / `runner.stop()` / `runner.restart()` / `runner.status()` / `runner.health()`

LinX 直接调用 API，而不是自己 `spawn` + 猜测 ready。

## 5. 配置契约（LinX 视角）

LinX 目前产品配置采用 5 项主配置：

1. 数据地址
2. 公网域名（手填或 cloud 分配）
3. 自动检查公网 IP
4. 隧道供应商（cloudflare / sakura frp）
5. HTTPS 证书

补充原则：

- 当自动检测到公网 IP 可达时，默认不走隧道
- 当选择 cloud 自动分配域名时，不强制用户手填域名
- 隧道供应商与隧道 token 必须成对配置（或允许复用已有 token）

这些属于“LinX 产品配置层”，xpod 侧只需保证对 env/参数的消费语义稳定。

## 6. 与 xpod Dashboard 的关系

LinX 不做 dashboard 复刻。LinX 只需要：

- 启动后提供入口跳转：`/app/`、`/dashboard/`
- 读取最小运行状态用于按钮与文案（启动/停止/重启/是否可跳转）

## 7. 迁移步骤建议

1. xpod 发布稳定启动契约（CLI/API）与文档
2. LinX 改为仅调用契约，删除 runtime 猜测与 fallback 逻辑
3. LinX 保留 `/api/service/*` 作为 UI 层包装，不再封装 xpod 内部细节
4. 用集成测试验证：
   - 能启动
   - 能返回 status/health
   - 能停止
   - 升级 xpod 次版本不改 LinX 代码也可工作

## 8. 验收标准（Definition of Done）

- xpod 提供并维护稳定 launcher 契约
- LinX 不再维护 xpod 启动内部逻辑
- LinX 仅作为调用方，功能行为不回退：
  - 本地可启动 xpod
  - 可读状态
  - 可停止/重启
  - 可跳转 xpod 原生页面
- 升级演练通过：替换 xpod 版本后 LinX 无需改启动代码

## 9. 交付物建议（xpod 团队）

- 一份 launcher 契约文档（参数、返回、退出码、错误码）
- 一组最小 E2E 用例（run/status/health/stop）
- 版本变更日志中注明 launcher 兼容性策略

