# Page Mindset And ASCII Prototype

## 设计原则

这版原型先抛开已有实现，从用户打开每个页面时的主心智出发：

- 用户不是来管理数据库的，是来继续一段工作会话。
- 用户关心“我现在该看哪里、下一步能做什么、东西存在哪里、怎么回到原处”。
- 桌面端应该丝滑：切换模块不打断上下文，详情在右侧自然展开，常用动作在视线附近。
- Pod 是信任背书，不是首屏教育内容。

## 全局壳心智

用户主心智：我打开 LinX，继续和我的助手、联系人、文件、收藏一起工作。

用户关心：

- 当前在哪个模块。
- 最近的会话/对象是否可继续。
- 全局通知是否有需要处理的事。
- 低频设置和聊天文件在哪里。

优秀交互：

- 左侧窄栏稳定，不跳动。
- 第二栏随模块切换，保持“列表/目录/索引”心智。
- 中间永远是主工作区。
- 右侧永远是当前对象详情，不做长说明。

```text
┌────┬────────────────────┬────────────────────────────────────────┬──────────────────┐
│ Me │ List / Index        │ Primary Work Area                      │ Object Detail    │
│    │ Search + New        │ Header + Main Flow                     │ Context / Actions│
│ 💬 │                    │                                        │                  │
│ 👥 │ Module-specific     │ User continues work here               │ Secondary info   │
│ 📁 │ list/tree/index     │                                        │                  │
│ ⭐ │                    │                                        │                  │
│    │                    │                                        │                  │
│ ☰  │                    │                                        │                  │
└────┴────────────────────┴────────────────────────────────────────┴──────────────────┘
```

## Chat / AI Secretary

用户主心智：我打开就是继续工作；先看未完成的会话，再直接把新东西丢给 AI Secretary。

用户关心：

- 哪些会话需要我看。
- AI Secretary 刚刚帮我整理了什么。
- 我可以直接输入、拖文件、贴链接、发任务。
- 相关文件/链接在哪里，能不能快速打开。

优秀交互：

- 默认选中 `AI Secretary`，不解释太多。
- 会话列表有 folders：全部、未读、工作、个人。
- 聊天流中有“今天整理”这种轻量工作摘要。
- 输入区像一个“收纳入口”，支持消息、文件、链接、任务。
- 右侧不是说明书，而是当前对象和工作现场：Thread、Workspace、Repository、Agent home。

```text
┌────┬────────────────────┬────────────────────────────────────────┬──────────────────┐
│ 💬 │ Search chats    +  │ AI Secretary                 bell more │ AI Secretary     │
│    │ [All][Unread][Work]│ 当前 Thread · Pod 已同步                │ 默认 Agent        │
│    │                    │                                        │ [请赐名]         │
│    │ ★ AI Secretary  1  │  今天                                  │                  │
│    │   默认助手 · 已同步 │  ┌ Secretary ───────────────────────┐ │ 工作现场         │
│    │ 我的空间           │  │ Workspace 已准备好                 │ │ Thread 原型调整  │
│    │ LinX 原型工作区     │  └───────────────────────────────────┘ │ Workspace linx   │
│    │ Cloud Node         │  ┌ You ─────────────────────────────┐  │ Tasks 2          │
│    │                    │  │ 按新模型继续重做原型              │  │ Agent home       │
│    │                    │  └───────────────────────────────────┘ │ /.data/agents/… │
│    │                    │  [ 像发消息一样丢文件、链接、任务... ] │ 保存原则 / 入口   │
└────┴────────────────────┴────────────────────────────────────────┴──────────────────┘
```

## Contacts

用户主心智：这些是我能协作的人、Agent 和群组；我想知道它是谁，以及能不能马上继续聊天。

用户关心：

- 这个对象是谁。
- 我和它的关系是什么。
- 最近一起做过什么。
- 主要动作：发消息 / 回到聊天。

优秀交互：

- 列表按人、AI 助手、群组分组。
- 详情页像联系人名片，不像配置页。
- `AI Secretary` 展示为默认助手，不给删除压力。
- 右侧展示 Contact / Person / Agent 关系和共享上下文，不展示 API Key。

```text
┌────┬────────────────────┬────────────────────────────────────────┬──────────────────┐
│ 👥 │ Search contacts +  │ AI Secretary                           │ 关系边界         │
│    │ AI Assistants      │ ┌───────────────┐                      │ Contact 关系卡   │
│    │ ● AI Secretary     │ │  big avatar   │  AI Secretary        │ Person 人类身份  │
│    │   Contact · Agent  │ └───────────────┘  Contact projection  │ Agent 执行能力   │
│    │   Research Agent   │                                        │                  │
│    │ People             │ [发消息] [请赐名] [收藏]               │ Recent files     │
│    │   Gan              │                                        │ map.md           │
│    │ Groups             │ WebID        https://...#secretary     │ tunnel.md        │
│    │   Design Room      │ Role         默认助手，不可删除         │                  │
│    │                    │ Agent Home   /.data/agents/secretary/  │                  │
└────┴────────────────────┴────────────────────────────────────────┴──────────────────┘
```

## Files

用户主心智：这是我的 Pod 文件浏览器；我按路径、容器、类型和权限找文件，不按聊天来源找文件。

用户关心：

- 我现在在哪个路径。
- 这里有哪些容器/文件。
- 文件大小、修改时间、权限。
- 如何打开 URI、复制 URI、下载、进入容器。

优秀交互：

- 左侧是位置和容器树。
- 中间是 Finder-like 表格。
- 面包屑和操作固定在顶部。
- 右侧 inspector 展示当前 resource。Agent home、Workspace、Repository 都是 Pod resource，但 Repository 只是元数据，Workspace 才是工作区。

```text
┌────┬────────────────────┬────────────────────────────────────────┬──────────────────┐
│ 📁 │ Locations           │ Files                                  │ Inspector        │
│    │ Pod Home            │ < Pod / .data / agents >      Upload + │ secretary/       │
│    │ .data               │                                        │ Agent home       │
│    │ Recent              │ Name                 Kind   Size  Time │                  │
│    │ Favorites           │ agents/              Folder 3    Today │ Path             │
│    │ Shared              │ agents/secretary/    Agent  8    09:44│ /.data/agents/… │
│    │ Containers          │ workspaces/linx/     Worksp .meta 09:42│ Profile          │
│    │ /                  │ repositories/linx.ttl Repo   4K  Today│ profile.ttl      │
│    │ chat/              │                                        │ Permission       │
│    │ files/             │ Repository 是元数据，Workspace 是工作区 │ Private          │
└────┴────────────────────┴────────────────────────────────────────┴──────────────────┘
```

## Favorites

用户主心智：这里不是收藏夹仓库，而是“我以后要回来看的东西”的重入索引。

用户关心：

- 我收藏了什么类型的东西。
- 它来自哪里。
- 点一下能不能回到原消息、原文件、原联系人。
- 最近/本周/更早如何快速扫。

优秀交互：

- 顶部按消息、文件、链接、联系人分段。
- 列表按日期组。
- 每行像 Telegram/Signal 的媒体列表：缩略图、标题、摘要、时间。
- 右侧明确显示“回到哪里”。

```text
┌────┬────────────────────┬────────────────────────────────────────┬──────────────────┐
│ ⭐ │ Search saved        │ Favorites                              │ Re-entry         │
│    │ [Msg][File][Link]  │                                        │ Selected item    │
│    │                    │ Today                                  │ Secretary rule   │
│    │ Today              │ ┌ msg  Secretary 初始化规则      09:41│                  │
│    │ Secretary rule     │ └ 默认助手不可删除，可改名             │ Go back to       │
│    │                    │ Yesterday                              │ Original message │
│    │ Yesterday          │ ┌ file tunnel.md                  Tue  │ AI Secretary     │
│    │ tunnel.md          │ ┌ link Cloudflare Tunnel          Tue  │ 09:41            │
│    │                    │ This week                              │                  │
│    │ This week          │ ┌ contact Design Room             Mon  │ Tags             │
└────┴────────────────────┴────────────────────────────────────────┴──────────────────┘
```

## 视觉生成提示词

用于生成参考图的方向：

```text
Design a polished desktop messenger prototype for LinX, a personal AI workspace.
Do not copy WeChat, Telegram, or Signal branding. Use an original calm ivory and ink UI, compact desktop density, subtle rounded cards, elegant shadows, and a four-column desktop layout.
The product mindset is chat-first like WeChat, desktop structure like Telegram Desktop, and personal capture like Telegram Saved Messages plus Signal Note to Self.
Show four modules as visual design boards: Chat with AI Secretary, Contacts, Files as a Pod/Finder browser, Favorites as a re-entry index.
Keep labels minimal, premium, quiet, and product-ready. No green WeChat styling, no purple SaaS dashboard, no technical RDF/OIDC explanation.
```
