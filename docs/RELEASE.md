# LinX Web 发布流程

以 Xpod 的发布规范为准（`undefinedsco/xpod` `staging` 分支 `docs/RELEASE.md`）：先合入 `staging`，由 `staging` 的提交生成 Release Candidate（RC），在共享 RC 上验收；只有验收通过的那个提交、那个镜像 digest 才能提升到生产。本文只写 LinX Web 与之对应的部分。

## 顺序

1. 开发分支自测（tsc、vitest、端到端）并经 PR 审查。
2. 普通 merge 合入 `staging`（保留祖先，不 squash、不 force-push）。`staging` 是唯一的 RC 来源。
3. 每个推到 `staging` 的提交触发 `.github/workflows/candidate.yml`：
   - `metadata`：版本 = 根 `package.json` 的 `version` + `-rc.<run>`（整轮重跑为 `-rc.<run>.<attempt>`），只接受 `staging`；
   - `verify`：web 类型检查、web 全量单元测试、service 构建与测试；
   - `build_image`：构建 web（`VITE_CLOUD_IDENTITY_URL=https://id.undefineds.co`，即 provider=undefineds.co），写入 `version.json`（版本 + 源提交），打成 `ghcr.io/undefinedsco/linx-web` 镜像，标签 `sha-<sha>` 与 RC 版本，记下 digest；
   - `deploy_and_accept`（GitHub Environment `rc`，共享 RC 串行）：把 `deploy/rc/linx-web-rc.yaml` 按 digest 渲染后**一次** apply，等滚动完成并核对运行中的 pod 就是这个 digest；再做静态部署检查（`scripts/verify-web-static-deploy.mjs`）和部署站点冒烟（`tests/e2e/specs/deployed-web-smoke.spec.ts`：各路由 200、缺失资源 404、`version.json` 是本候选、云端登录跳到 provider）；
   - 通过后上传 `release-acceptance-<sha>`（`release-acceptance.json`：候选版本、源提交、镜像 digest、RC 地址、provider、run 链接）。这是提升生产的唯一凭证。
4. 人工在 RC 上验收产品（按 `docs/reviews/linx-r6-product-audit-2026-10-10.md` 的清单）。
5. 生产：在验收通过的 staging exact SHA 上打 `linx-v<version>`，用同一个 digest 更新生产 `linx-web`（不重新构建）；再把该提交 squash 同步到 `main`，提交说明里记下 staging SHA、验收 run 和 digest。生产提升工作流尚未建立，见“待补”。

修复同样先合入 `staging` 生成新候选；不在 RC 上热改、换镜像，不借旧候选的验收记录。

## RC 环境需要先配好

GitHub Environment `rc`（Settings → Environments，deployment branch policy 限定 `staging`）：

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| Secret | `KUBE_CONFIG_DATA` | base64 的广州 Sealos kubeconfig（RC 所在集群） |
| Variable | `SEALOS_NAMESPACE` | RC 所在 namespace（广州为 `ns-iknkxtc8`） |
| Variable | `LINX_RC_HOST` | RC 用 Sealos 分配的域名（不挂我们自己的域名），例如 `linx-web-rc.sealosgzg.site`；RC 地址即 `https://<LINX_RC_HOST>` |
| Variable | `LINX_RC_TLS_SECRET` | 可选，Sealos 通配证书所在的 Secret，默认 `wildcard-cert` |

另外：

- 域名：RC 只用 Sealos 自己的域名，由 `deploy/rc/linx-web-rc.yaml` 里的 Ingress 直接指到 `linx-web-rc`，不用改 DNS，也不经过共享网关（homepage 仓库的路由表不用动）。
- 镜像拉取：`ghcr.io/undefinedsco/linx-web` 首次推送后默认是私有包；要么在 GitHub 把它设为公开，要么在 namespace 里配 GHCR 拉取凭据并加到 `deploy/rc/linx-web-rc.yaml` 的 `imagePullSecrets`。

## 待补

- 生产提升工作流：校验 stable tag 指向带 `release-acceptance-<sha>` 的 staging 提交，用记录里的 digest 更新生产 `linx-web`（目前生产是 nginx 读 PVC `linx-web-content`，清单在 homepage 仓库，需要改为按镜像 digest 部署，或由提升流程把同一镜像里的文件同步进 PVC）。
- 桌面安装包仍走手动 `Release` 工作流（`.github/workflows/release.yml`），不在本流程内。
