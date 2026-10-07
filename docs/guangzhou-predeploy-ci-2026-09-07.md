# 广州发布前检查（2026-09-07）

## 结论

本批 Xpod 的主要回归已修复，完整构建、全量测试和两轮完整集成测试通过。Xpod 已提交并推送 `962f5ea3229ca18989c96baf1d00282267e14224` 到 `test`。原生 QLever 镜像仍需构建并通过真实运行时门禁，因此目前没有新增广州 E2E 通过声明，也尚未将本批修改部署到广州 MAIN。

SDK 构建已通过本地 Chrome 手动触发：[运行 34048737675](https://github.com/undefinedsco/xpod/actions/runs/34048737675)。表单分支为 `test`，source_commit 为上述精确提交；使用最近成功 SDK 的不可变摘要作为增量构建缓存，不复用旧运行时作为本次验收结果。

## 最新复测（替代下文初次失败结果）

| 检查 | 结果 |
| --- | --- |
| Xpod 完整构建（TS、组件、共享包、UI） | 通过 |
| Xpod 全量 Vitest | 372 文件通过、37 文件跳过；3042 测试通过、267 跳过 |
| UI 独立工作区 | 13 文件、77 测试通过；全部原有用例保留 |
| 完整集成 lite | 24 文件通过、4 文件跳过；130 测试通过、10 跳过 |
| 完整集成 full | 真实 PostgreSQL、Redis、对象存储；4 文件、40 测试通过 |
| 提交前第二轮完整集成 | lite 130 通过、10 跳过；full 40 通过，退出码 0 |
| 测试代码类型检查 | 未通过：36 处；干净 HEAD 对照为 37 处，无新增错误，消除 1 处 bun:test 导入问题 |
| 原生镜像静态契约 / SDK Python 契约 | 11 / 12 通过；不代表原生编译或运行验收 |
| 广州新版本浏览器 E2E | 未执行，等待原生镜像、服务构建及 MAIN 部署 |

全量 Vitest 中的本地原生进程使用仓库测试 fixture；不作为真实原生运行时证据。原生新资源、JSON 字面量、不存在的授权图/来源等 5 个用例现已明确门控跳过，而非提前 return 后假通过。发布原生镜像的流水线新增了这些用例，必须针对正在发布的真实镜像执行成功。

已修复：移除跨请求权限缓存，保留逐请求批量权限读取；将 endpoint union-default 与标准 RDF 默认图分开；统一 API/CSS 的 PostgreSQL 向量后端；恢复 Local QLever 契约；安全处理镜像自引用链接；将 UI React/router 测试与服务端依赖隔离；本地恢复保留离线删除检查点及失败任务重试记录。

测试类型错误属于现有基线，未在本批扩大修改无关测试。对照使用同一依赖安装及 `c877db3c` 的临时干净源码副本，比较结果为新增 0、消除 1。

GitHub 广州发布 #29（`33984972108`）此前在默认图语义断言失败，部署步骤未执行。当前广州自动工作流目标是 `xpod-rc`，不能把它成功等同于 MAIN `xpod-cloud` 已更新；后续必须单独记录 MAIN 镜像和上线验证。

最新证据：

- `/tmp/xpod-ci-20260907-all-final.log`
- `/tmp/xpod-ci-20260907-build-all.log`
- `/tmp/xpod-ci-20260907-ui-workspace-radix.log`
- `/tmp/xpod-ci-20260907-integration-final.log`
- `/tmp/xpod-ci-20260907-integration-precommit.log`
- `/tmp/xpod-ci-20260907-typecheck-test.log`
- `/tmp/xpod-ci-20260907-typecheck-baseline.log`
- `/tmp/xpod-ci-20260907-recovery-red.log`（原实现两项恢复回归确实失败）

## 版本与保全

- LinX `test`: `f96d6cc088ddb2aa1d9d448bfdbaf7a02125e5de`，未提交内容只有 `.gstack` 工具状态，不纳入业务提交。
- Xpod 本地从 `57affe59` 快进到远端 `test` 的 `c877db3c007a3c19869e956eadabb959915a1e4c`。
- 原有改动保存在 Xpod stash：`pre-ci-20260907-preserve-local-changes`，仍保留备份。
- 已重新应用本地修改，解决两个冲突文件，保留远端较新的凭据地址优先级及回归测试。重复改动已自然合并；未删除本地开发内容。
- 没有修改新加坡资源。

## 初次检查结果（历史，已由上方复测更新）

| 检查 | 结果 |
| --- | --- |
| LinX Web `build:check` | 通过，包含 TypeScript 和生产构建 |
| LinX Web 全量单测 | 2912/2912 通过，JSON 报告 success=true |
| Xpod `build:ts` | 通过 |
| Xpod `build:packages`、`build:ui` | 通过 |
| Xpod 定向测试 | 4 文件、28 测试通过 |
| Xpod `test:run` | 363 文件通过、9 文件失败、36 文件跳过；3003 测试通过、6 失败、264 跳过，另有 7 个未处理错误 |
| Xpod integration-lite | 25 文件通过、3 文件跳过；133 测试通过、5 跳过 |
| Xpod integration-full | 未通过，见下文 |
| diff whitespace 检查 | 通过 |

这些单测包含测试替身；integration-lite 是自举本地 Pod，部分能力仍有门控跳过。均不能替代广州真实浏览器端到端验收。

## 初次发现的问题与背景（历史）

1. **权限缓存隔离风险（新增改动）**
   `src/http/SubgraphSparqlHttpHandler.ts` 缓存键使用 WebID（或 clientId）作为单一 principal，不同时区分客户端、issuer 和权限变更；30 秒内复用授权范围。诊断调用同一个 handler，第一次允许，随后更换为同一 WebID 的受限客户端并令 authorizer 拒绝；实际 permission reader 仅调用一次，返回同一允许范围，未包含 denied graph。此为受控代码级复现，不是对线上私人数据的越权访问。应移除跨请求授权结果缓存，或实现充分的身份隔离和权限失效契约后再发布。

2. **默认图语义回归（新增改动相关）**
   `PublicCloudSemanticConformance` 的 `graph/default-and-named` 期望两行，实际三行，命名图内容额外出现在默认图。不能简单修改期望值让测试变绿；需要对齐 Pod endpoint 的 union-default 语义与标准数据集语义。

3. **默认 Local 引擎契约冲突（新增改动）**
   `config/local.json` 从 QLever 改为 RdfQuerySparqlEngine，而现有 `DefaultRdfImport` 测试明确约束 Local 使用 QLever。需明确并统一实现契约，不能作为普通配置微调直接发布。

4. **Docker 打包规则冲突（新增改动）**
   `docker-runtime-workspaces` 检查拒绝新增的 `rm -rf /app/node_modules...`。本地改动仅清理包自引用路径，但仍需核对真实镜像打包与规则的一致性。

5. **测试环境/已有基线问题，归因待进一步隔离**
   - `/opt/xpod/qlever/bin/xpod_qlever_local_runtime` 不存在，触发多项运行时测试初始化失败。
   - Vitest 收集 `CloudBinaryAccessConfig.test.ts` 时无法加载 `bun:test`。
   - ModelsPage 测试出现 `useSyncExternalStore` dispatcher 为 null，堆栈涉及根目录 React 与 UI React。
   - 本机使用 Node 25.9；OIDC 依赖提示需 LTS。后续应对齐 CI Node 22 重跑。

6. **完整集成环境未启动成功**
   初次 Docker 未启动，已启动 Docker；随后发现 `XPOD_FULL_POSTGRES_IMAGE` 未配置。补充独立测试项目及镜像后，再使用仓库已有的固定 pgvector 镜像重跑，仍在初始化时报 `Unsupported PostgreSQL RDF vector index schema: missing column rdf_vector_chunks.embedding_vector`。尚未进入完整集成断言阶段，不能算通过。只使用独立本地测试资源，没有改广州数据库。

7. **原生代码发布链未验收**
   本批包含 QLever C++ 修改；服务 Dockerfile 从固定镜像拷贝原生 runtime，单独构建 Xpod 服务不会自动包含这些 C++ 修改。需要原生 runtime 构建、语义验收及镜像 digest 更新的完整链路。

## 证据位置（本机）

- `/tmp/linx-ci-20260907-web.json`
- `/tmp/linx-ci-20260907-web.log`
- `/tmp/xpod-ci-20260907-unit.log`
- `/tmp/xpod-ci-20260907-build.log`
- `/tmp/xpod-ci-20260907-full.log`
- `/tmp/xpod-ci-20260907-full-vector.log`

## 后续顺序

先消除权限缓存与查询语义风险，统一 Local 引擎契约；再对齐依赖和原生运行时，重新跑发布前检查。所有检查通过后才提交、构建、部署广州，最后从广州登录开始逐项跑真实浏览器验收。
