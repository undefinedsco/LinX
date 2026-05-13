# Visual Verification Report

## 验收目标

本轮目标是重新设计 `apps/prototype`，不沿用旧实现的视觉结构；先沉淀页面心智和 ASCII 线框，再生成图片参考，最后实现并做视觉验收。

验收标准：

- 首屏是低解释成本的 chat-first 产品心智，不教育用户理解 Pod / RDF / OIDC / runtime。
- 桌面结构是稳定四栏：左侧主模块、第二栏列表/目录/索引、中间主工作区、右侧当前对象详情。
- 四个一级模块都可独立截图验收：`聊天`、`联系人`、`文件`、`收藏`。
- `AI Secretary` 是默认入口，表现为会话、联系人和个人收纳助手。
- `文件` 是 Finder/Pod resource 浏览视角，不按聊天来源组织。
- `聊天文件` 是左下低频菜单二级入口，不成为一级模块。
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
✓ 1581 modules transformed.
dist/assets/index-BJ-qxhh4.css   32.64 kB │ gzip:  6.49 kB
dist/assets/index-1FvkEX0j.js   166.00 kB │ gzip: 53.28 kB
✓ built in 2.74s
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

结果：无匹配。原型 CSS 不再包含硬编码 `#hex / rgb() / rgba()` 颜色，局部 `--proto-*` 只作为 `hsl(var(--foreground))`、`hsl(var(--primary))`、`hsl(var(--warm-amber))` 等全局 token 的语义别名。

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

## 视觉 Verdict

```json
{
  "score": 91,
  "verdict": "pass",
  "category_match": true,
  "differences": [
    "实现版没有像素复制参考图，但保留了紧凑桌面密度、四栏结构和 warm guardian 的柔和界面气质。",
    "颜色已切回 LinX 全局 token：主操作使用 --primary，温暖点缀使用 --warm-amber，背景/卡片/边框使用 shadcn/global layout token。",
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
