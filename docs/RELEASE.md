# LinX Web 发布流程

以 Xpod 的发布规范为准（`undefinedsco/xpod` `staging` 分支 `docs/RELEASE.md`）：先合入 `staging`，由 `staging` 的提交生成 Release Candidate（RC），在共享 RC 上验收；只有验收通过的那个提交、那个镜像 digest 才能提升到生产。本文只写 LinX Web 与之对应的部分。

## 顺序

1. 开发分支自测（tsc、vitest、端到端）并经 PR 审查。
2. 普通 merge 合入 `staging`（保留祖先，不 squash、不 force-push）。`staging` 是唯一的 RC 来源。
3. 每个推到 `staging` 的提交触发 `.github/workflows/candidate.yml`：
   - `metadata`：版本 = 根 `package.json` 的 `version` + `-rc.<run>`（整轮重跑为 `-rc.<run>.<attempt>`），只接受 `staging`；
   - `verify`：web 类型检查、web 全量单元测试、service 构建与测试；
   - `local_e2e`：对一个种子化的本地 xpod（npm 包、SQLite，不需要 Docker）跑端到端：登录、各主页面、问 LinX 引用（发送 / 编辑 / 重试都带给模型）、撤回与“数据”文件夹、登录后读写 Pod；覆盖 RC（只走云端）测不到的本地 / 独立空间；
   - `standalone_e2e`：用已发布的 xpod 镜像（默认 `ghcr.io/undefinedsco/xpod:0.4.30`，可用 Variable `XPOD_STANDALONE_TAG` 覆盖）以 local 模式起一个独立空间（自带身份服务，种子账号见 `tests/e2e/fixtures/standalone-seed.json`，只在 CI 容器里用），经“使用其他空间”登录后读写 Pod、发消息；
   - `build_image`：构建 web（`VITE_CLOUD_IDENTITY_URL=https://id.undefineds.co`，即 provider=undefineds.co），写入 `version.json`（版本 + 源提交），打成 `ghcr.io/undefinedsco/linx-web` 镜像，标签 `sha-<sha>` 与 RC 版本，记下 digest；
   - `deploy_and_accept`（GitHub Environment `rc`，共享 RC 串行）：把 `deploy/rc/linx-web-rc.yaml` 按 digest 渲染后**一次** apply，等滚动完成并核对运行中的 pod 就是这个 digest；再做静态部署检查（`scripts/verify-web-static-deploy.mjs`）和部署站点冒烟（`tests/e2e/specs/deployed-web-smoke.spec.ts`：各路由 200、缺失资源 404、`version.json` 是本候选、云端登录跳到 provider），再做登录后验收：把 xpod 的 RC provider（`deployment/xpod-rc`，平时由 xpod 的 RC 流程缩到 0）经 Sealos 域名 `ids` / `podss` / `apis.sealosgzg.site`（`deploy/rc/xpod-rc-sealos.yaml`，xpod 网关已有这三条路由）拉起：用本次运行专属的 seed Secret（`xpod-rc-seed-linx-<run>-<attempt>`：`scripts/rc-provider-seed.mjs` 每轮生成 Alice、Bob 和随机密码，账号和 Pod 加本轮后缀；只用于验收，不需要维护任何账号 Secret）并把 `CSS_BASE_URL` 等身份地址临时指向 Sealos 域名，一次 patch（`scripts/xpod-rc-provider-patch.mjs`）完成；用其中 Alice 账号经“使用其他空间”登录 RC 站点（`tests/e2e/specs/deployed-signed-in.spec.ts`：在 Pod 里写读删一个文件、发一条消息并要求模型真实回答；写入的文件放在本次运行的目录里，结束时删除）；结束后（无论成败）若 xpod-rc 仍挂着本次的 seed，就把 seed 和环境变量还原并缩回 0，再删掉该 Secret。xpod-rc 正在运行（xpod 的 RC 在用）时本步直接失败，等它缩回 0 后重跑；
   - 通过后上传 `release-acceptance-<sha>`（`release-acceptance.json`：候选版本、源提交、镜像 digest、RC 地址、provider、run 链接）。这是提升生产的唯一凭证。
4. 人工在 RC 上验收产品（按 `docs/reviews/linx-r6-product-audit-2026-10-10.md` 的清单）。RC 用完即清：`deploy_and_accept` 结束时（无论成败）把 `linx-web-rc` 缩到 0，xpod-rc 也还原到 0；Service、Ingress 和证书保留。人工验收前先 `kubectl -n ns-iknkxtc8 scale deployment/linx-web-rc --replicas=1`，看完再缩回 0。
5. 生产：在验收通过的 staging exact SHA 上打 `linx-v<version>`（版本 = 根 `package.json`）。`.github/workflows/promote.yml` 随之运行：
   - 核对标签在 `staging` 上、版本与 `package.json` 一致，找到该提交成功的 RC run，下载 `release-acceptance-<sha>`，要求全部检查为 passed；
   - 把验收过的 digest 加打 `<version>` 和 `latest` 标签（不重新构建）；
   - 用 `deploy/prd/linx-web.yaml` 按该 digest `kubectl replace` 生产 Deployment `linx-web`（名字、`app: linx-web` 选择器和 8080 端口不变，Service 和网关路由不用动；文件来自镜像，不再挂 PVC `linx-web-content`），等滚动完成，核对 pod 的 digest；
   - 对生产地址做静态部署检查和只读冒烟；任何一步失败就 `rollout undo` 回到上一个版本。
   之后把该提交 squash 同步到 `main`，提交说明里记下 staging SHA、验收 run、digest 和上一个同步点。

修复同样先合入 `staging` 生成新候选；不在 RC 上热改、换镜像，不借旧候选的验收记录。

## RC 环境需要先配好

GitHub Environment `rc`（Settings → Environments，deployment branch policy 限定 `staging`）：

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| Secret | `KUBE_CONFIG_DATA` | base64 的广州 Sealos kubeconfig（RC 所在集群）；也可以不设，改用组织级密钥 `GZ_KUBE_CONFIG_DATA`（与 xpod 共用，需共享给 LinX 仓库） |
| Variable | `SEALOS_NAMESPACE` | RC 所在 namespace（广州为 `ns-iknkxtc8`） |
| Variable | `LINX_RC_HOST` | RC 用 Sealos 分配的域名（不挂我们自己的域名），现在是 `linx.sealosgzg.site`；RC 地址即 `https://<LINX_RC_HOST>` |
| Variable | `LINX_RC_EXPECT_MODEL_REPLY` | 可选，默认 `1`：要求消息得到模型真实回答 |
| Variable | `LINX_RC_CERT_ISSUER` | 可选，签发 RC 证书的 cert-manager Issuer，默认 `linx-letsencrypt`（集群里没有 Sealos 通配证书，Sealos 域名的证书都由 cert-manager 签） |

另外：

- 域名：RC 只用 Sealos 自己的域名，由 `deploy/rc/linx-web-rc.yaml` 里的 Ingress 直接指到 `linx-web-rc`，不用改 DNS，也不经过共享网关（homepage 仓库的路由表不用动）。
- 镜像拉取：`ghcr.io/undefinedsco/linx-web` 首次推送后默认是私有包；要么在 GitHub 把它设为公开，要么在 namespace 里配 GHCR 拉取凭据并加到 `deploy/rc/linx-web-rc.yaml` 的 `imagePullSecrets`。

## 生产环境需要先配好

GitHub Environment `prd`（deployment branch/tag policy 限定 `linx-v*` 标签）：

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| Secret | `KUBE_CONFIG_DATA` | base64 的广州 Sealos kubeconfig（生产 `linx-web` 所在集群） |
| Variable | `SEALOS_NAMESPACE` | `ns-iknkxtc8` |
| Variable | `LINX_PROD_URL` | `https://linx.undefineds.cn` |

生产清单从此由本仓库管理（`deploy/prd/linx-web.yaml`）；homepage 仓库里的 `deploy/k8s/linx-web-renamed.yaml` 只作历史记录，不要再用它 apply，否则会把 Deployment 改回挂 PVC 的旧形态。

## 不在本流程内

- 桌面安装包仍走手动 `Release` 工作流（`.github/workflows/release.yml`）。
