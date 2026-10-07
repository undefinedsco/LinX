# 广州 main rebase 发布验收（进行中）

## 边界

- 两仓库 test 基于 main；Xpod 模型管理为权威，不恢复旧并行凭据逻辑。
- 仅广州 Undefineds，namespace `ns-iknkxtc8`，部署对象 `homepage` / `xpod-cloud`。
- 不修改新加坡，不删除业务数据；本文件不表示发布完成。

## 本轮已验证

- Xpod TypeScript 编译通过。
- 网关协议、路由、服务、HTTP transport 专项测试 94/94 通过。
- 先前 17 项失败源于协议单测借用了本机 DNS，模型域名解析为代理保留地址；注入固定测试解析器后通过，未放宽生产请求安全校验。
- 图片请求整合补齐用户认证上下文；multipart 使用新版地址校验、超时与资源回收。
- 清理前端旧依赖覆盖问题：旧 ui/node_modules 已移动到 /tmp 下备份，再按锁文件安装。完整 UI 四目标构建通过。

## 正在执行 / 未完成

- 完整集成测试：前轮 143 项通过但一个套件端口竞争；两处服务器初始化均改用 port 0 后重新执行，尚待最终结果。
- 镜像构建：候选 `gz-main-rebase-20260908`，绑定主分支 QLever runtime digest；本地构建配方保留 TLS 校验。尚未推送或 rollout。
- LinX 仍需核对新版 Xpod 模型管理消费方式，不能把 rebase 视为接口迁移已完成。
- 尚未执行新版本广州浏览器 E2E；不得复用旧版本通过记录。

## 日志

### 2026-09-09 继续核实

- 广州仍使用 Sealos 既有数据库、Secret 和 xpod-cloud-storage PVC；没有创建替代业务数据库。
- 上次本地完整测试失败不能作为广州数据库认证故障的证据；两种环境的结果必须分开报告。
- 广州 homepage / xpod-cloud 各 1 Ready，镜像仍为上文旧版本。
- 构建原生基础镜像缺少 CA bundle，候选构建已从 Node 构建镜像复制标准 CA bundle；Debian 源容器内仍有 TLS 问题，已切换腾讯云 Debian 镜像源继续诊断。宿主机 Debian HTTPS 探测返回 200，证书校验通过。
- 当前构建日志 `/tmp/xpod-gz-main-image-20260909.log`；本节不表示推送、部署或 E2E 已完成。

- `/tmp/xpod-rebase-build-20260908.log`
- `/tmp/xpod-rebase-ui-20260908.log`
- `/tmp/xpod-rebase-main-integration-20260908.log`
- `/tmp/xpod-gz-main-image-20260908.log`

## 部署前核对

广州 xpod-cloud 当前仍为旧摘要 `4947fc185e1340f1ad4084db2e1a014428b13e6f65072138417fee734690e18a`；homepage、xpod-cloud 各 1 Ready。
验收入口：https://undefineds-gz.sealosgzg.site/chat 。认证入口：https://undefineds-gz-id.sealosgzg.site/ 。
