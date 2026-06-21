# Visual Verification Report

## 验收目标

本轮目标是重新设计 `apps/prototype`，不沿用旧实现的视觉结构；先沉淀页面心智和 ASCII 线框，再生成图片参考，最后实现并做视觉验收。

验收标准：

- 首屏是低解释成本的 chat-first 产品心智，不教育用户理解 Pod / RDF / OIDC / runtime。
- 桌面结构是稳定四栏：左侧主模块、第二栏列表/目录/索引、中间主工作区、右侧当前对象详情。
- 四个一级模块都可独立截图验收：`聊天`、`联系人`、`文件`、`收藏`。
- `AI Secretary` 是默认入口，表现为会话、联系人和个人收纳助手。
- `文件` 是 Finder/Pod resource 浏览视角，不按聊天来源组织。
- `聊天文件` 是左下低频菜单弹窗入口，不成为一级模块。
- `Inbox` 是右上角三栏通知弹窗，不成为一级模块；审批详情在中间列表项展开，右侧保留入口，Chat inline 审批卡和 Inbox 状态同步。
- `密钥` 和 `模型` 是左下底部菜单里与 `设置` 并列的二级页面；供应商只作为两者内部的分组。
- 视觉颜色使用现有全局 token，不在原型里另起品牌色。

## 设计产物

| 产物 | 文件 |
| --- | --- |
| 产品参考原则 | `docs/prototype/product-reference-principles.md` |
| 页面主心智和 ASCII 线框 | `docs/prototype/page-mindset-ascii.md` |
| RightCodes 生成参考图 | `docs/prototype/assets/product-reference-board.png` |
| 原型实现入口 | `apps/prototype/src/main.tsx` |
| 原型视觉样式 | `apps/prototype/src/prototype.css` |
| 全局颜色来源 | `apps/web/src/index.css` |

## 构建验证

已执行：

```bash
yarn workspace @linx/prototype build
```

结果：通过。

输出摘要：

```text
✓ 1585 modules transformed.
dist/assets/index-BbLHjnL1.css   41.79 kB │ gzip:  7.69 kB
dist/assets/index-Br5i8mvO.js   182.42 kB │ gzip: 55.98 kB
✓ built in 1.74s
```

字重检查：

```json
{
  "h1": "650",
  "rowTitle": "600",
  "body": "400"
}
```

颜色检查：

```bash
rg -- "#[0-9a-fA-F]{3,6}|rgba\\(|rgb\\(" apps/prototype/src/prototype.css
```

结果：无匹配。原型 CSS 不再包含硬编码 `#hex / rgb() / rgba()` 颜色，局部 `--proto-*` 只作为 `hsl(var(--foreground))`、`hsl(var(--primary))` 等全局 token 的语义别名。

## 截图证据

服务：

```bash
yarn workspace @linx/prototype dev --host 127.0.0.1 --port 5871
```

截图命令使用 Playwright 以 `1440x900` 视口逐个点击四个一级模块。

| 场景 | 截图 |
| --- | --- |
| Chat / AI Secretary | `docs/prototype/assets/prototype-chat-redesign-1440x900.png` |
| Contacts / 名片详情 | `docs/prototype/assets/prototype-contacts-redesign-1440x900.png` |
| Files / Pod Finder | `docs/prototype/assets/prototype-files-redesign-1440x900.png` |
| Favorites / 回跳索引 | `docs/prototype/assets/prototype-favorites-redesign-1440x900.png` |
| Chat Files / 底部菜单弹窗 | `docs/prototype/assets/prototype-chat-files-modal-1440x900.png` |
| Inbox / 三栏通知与审批弹窗 | `docs/prototype/assets/prototype-inbox-modal-1440x900.png` |
| Keys / 供应商分组密钥页 | `docs/prototype/assets/prototype-keys-1440x900.png` |
| Models / 供应商分组模型页 | `docs/prototype/assets/prototype-models-1440x900.png` |

## DOM 断言

Playwright 同步断言：

```json
{
  "shell": true,
  "modules": ["聊天", "联系人", "文件", "收藏"],
  "visiblePrincipleBadge": false,
  "detailPane": true,
  "filesNoSourceColumn": true,
  "secondaryChatFiles": true,
  "chatFilesOpensAsModalFromBottomMenu": true,
  "inboxOpensAsModalFromBell": true,
  "inboxHasThreeColumns": true,
  "keysOpensFromBottomMenu": true,
  "modelsOpensFromBottomMenu": true,
  "settingsRemainsSeparate": true,
  "approvalStatusSyncsBetweenInboxAndChat": true,
  "sampleTextColor": "rgb(15, 23, 42)"
}
```

断言解释：

- `.prototype-shell` 存在，说明原型壳正常渲染。
- 主导航只暴露四个一级入口：聊天、联系人、文件、收藏。
- 设计说明徽标不显示在产品界面里，避免首屏非产品解释。
- 右侧 detail pane 存在，四栏结构成立。
- Files 页面没有 `来源` 主视角列，避免退回“聊天来源文件”组织。
- `聊天文件` 仍存在于左下菜单二级入口。
- 点击左下菜单的 `聊天文件` 可以打开按来源会话组织的弹窗，不切换当前模块。
- 点击右上角消息中心铃铛可以打开 Inbox 三栏弹窗，不切换当前模块。
- Inbox 弹窗包含左侧分类、中间待处理列表、右侧来源入口和快捷动作。
- 单个审批在中间列表项展开，完整展示动作、目标资源、风险说明、影响范围和批准/拒绝操作。
- 在 Inbox 批准同一条审批后，回到 Chat inline 卡片能看到 `已批准`，证明两处不是两份互相漂移的 UI 状态。
- 点击左下菜单的 `密钥` 可以打开供应商分组的密钥二级页面。
- 点击左下菜单的 `模型` 可以打开供应商分组的模型二级页面。
- `设置` 与 `密钥`、`模型` 并列，只保留账号、服务、Local 和通知等通用配置。
- 密钥页面展示当前激活、使用中、429/rate limited 和 500/server error 等状态，并能看到密钥关联的模型路由。
- 供应商只作为密钥和模型页面里的分组，不额外出现供应商设置页。

## 视觉 Verdict

```json
{
  "score": 91,
  "verdict": "pass",
  "category_match": true,
  "differences": [
    "实现版没有像素复制参考图，但保留了紧凑桌面密度、四栏结构和克制的桌面工作台气质。",
    "颜色已切回 LinX 全局 token：主操作使用 --primary，背景/卡片/边框使用 shadcn/global layout token。",
    "Chat 默认进入 AI Secretary，会话列表、聊天流、输入区和右侧上下文都围绕继续工作展开。",
    "Contacts 是联系人名片和共享上下文，不是 Agent 配置页。",
    "Files 使用位置/容器树、文件表格和 resource inspector，符合 Finder/Pod 浏览心智。",
    "Favorites 使用日期组、类型 tab 和回跳详情，符合重入索引心智。",
    "当前仍是静态视觉原型，没有覆盖真实登录、Pod 写入、ChatKit 发消息或 Electron 壳。"
  ],
  "suggestions": [
    "进入生产实现时按四个模块拆并行 lane，不直接复制 mock 数据。",
    "Files 一级模块必须保持 Finder/Pod 视角；聊天文件只能作为二级入口或收藏回跳关系。",
    "后续接入真实数据后，补空状态、加载状态、错误状态和权限状态截图验收。"
  ],
  "reasoning": "原型已经从旧实现切换到参考原则驱动的四栏桌面体验；核心产品心智、模块边界和视觉方向都与 ASCII 和参考图一致，同时颜色回归现有全局视觉系统。剩余风险在真实数据与运行时接入，不属于本轮静态原型验收范围。"
}
```

## 不覆盖项

- 未验证真实登录流程。
- 未验证真实 Pod schema 写入。
- 未验证真实 ChatKit 对话。
- 未验证 Electron 壳。
- 未做自动 pixel diff。
