# Design

> 2026-09-28 R6 target contract: [LinX × Xpod product experience](../homepage/docs/specs/personal-ai-product-experience-r6.md) governs navigation, task surfaces, personal methods/model lifecycle, recovery and density. Primary navigation is 工作 / 知识 / 我的 AI. This replaces the former four-entry and universal Chat-first constraints; human conversations, groups, contacts, favorites and old resource links remain supported. R5 retains the product story “训练你的 AI，让它学会你的判断” / “You define your Jarvis”; target designs do not claim training has shipped.
>
> The [selected brand](../homepage/DESIGN.md), shared models, identity/storage contracts, Task/Run facts and Personal Model Foundry governance retain their authority. R6 changes the user-facing design, not those domain protocols. This pass reviewed documents only; implementation and usability verification remain delivery requirements.

## Source of truth

- Status: Active target design; implementation not verified by this document pass
- Last refreshed: 2026-09-28
- Primary product surfaces: Desktop/Web shell, chat, contacts, files, favorites, inbox, settings, login/onboarding, Local/Standalone/Cloud runtime status, Secretary/Symphony control surfaces.
- Evidence reviewed this pass: joint R6 spec; `docs/desktop-product-strategy.md`, `docs/ui-style-guide.md`, `docs/ui-component-architecture.md`, Shell/Contacts/Favorites/Profile module specs, `docs/login-modal-local-binding-spec.md`, `docs/login-experience-map.md`, and `docs/secretary/auto-symphony-contract.md`. Earlier reference patterns are design references, not evidence of current implementation.

This file is the design contract for LinX user-facing product work. It supersedes earlier local-only login guidance and earlier emotion-led brand language. Main owns the compact Local login contract: remembered accounts continue directly; first-time `undefineds` users choose `云端空间` or `本机空间`; third-party account providers do not expose a storage picker.

Reference roles:

- Apple / Premium: visual discipline, native-feeling restraint, typography, spacing, and surface hierarchy; do not copy brand identity or assets.
- WeChat: desktop chat interaction skeleton only: low setup burden, object lists, current conversation, and familiar re-entry surfaces.
- Linear / Raycast: command clarity, state legibility, keyboardable operations, and fast work recovery.
- Notion: linked context and document organization patterns, without turning LinX into a generic document editor.
- GitHub: issue/review/audit trail discipline for approvals, evidence, and changes.
- OpenAI / Claude: AI runtime interaction patterns, streaming work state, model/tool transparency, interruption, and recovery.

## Brand

- Personality: Precise, calm, trustworthy, native-feeling AI workspace. LinX should feel operationally clear before it feels decorative.
- Trust signals: Make storage location, active provider, runtime readiness, workspace binding, approval state, AI work state, and Secretary action explicit at the point where the user needs them.
- Avoid:
  - Treating LinX as a WeChat clone or applying WeChat brand skin.
  - Treating macOS / Apple references as assets to copy. Use platform discipline, not Apple identity.
  - Broad purple SaaS styling, decorative gradients, glow, heavy shadow, noisy emoji state, or cuteness-heavy microcopy.
  - Hiding infrastructure, AI backend, retry, timeout, approval, or worker state behind vague progress text or silent non-response.
  - Showing Cloud data when the user selected a Local/Standalone storage space.
  - Turning Files into a decorative card wall, fake Finder clone, or separate card database.

## Product goals

- Goals:
  - Support daily human and AI collaboration in Work; restore the last valid context, with Work as the first-use starting point.
  - Keep familiar conversation lists, groups, search, unread and re-entry; use full reading, editing and comparison surfaces when the decision needs them. Ordinary human conversation does not require a Task or Issue.
  - Keep macOS-native visual discipline: restrained chrome, neutral surfaces, sparse accent, border-led separation, system typography, subtle motion.
  - Make Pod/storage/runtime/approval/Secretary behavior understandable without requiring users to learn internal architecture first.
  - Make Files a resource-first Pod browser and Personal Linked Context surface: ordinary files stay file-primary, structured RDF resources become queryable/editable views, and long documents remain human-editable files linked from modeled resources.
  - Make AI work state visible, interruptible, and traceable: backend/model, tool calls, retries, timeout, auto-mode, Symphony handoff, approvals, and waiting states must not disappear.
- Non-goals:
  - Recreating WeChat visuals, colors, or social product semantics.
  - Building an Apple-branded interface or copying Apple proprietary assets.
  - Exposing every AI/runtime capability as a separate top-level product area.
  - Turning Local tunnel/network setup into a required login step.
  - Treating audit, credentials, provider/base-model configuration and diagnostics as primary navigation. Personal methods and personal model lifecycle belong to My AI, not this low-frequency bucket.
  - Duplicating modeled Pod resources in a parallel app-local card/table authority.
- Success signals:
  - A first-time user can start work or human conversation without architecture knowledge or a trained personal model.
  - A returning user can identify where data is stored, what runtime/backend is active, and why the AI is waiting or retrying.
  - Approval, inbox, favorites, knowledge and audit return to the original legal object/context, including a human conversation, source, method or evaluation.
  - Visual review finds restrained, native-feeling UI rather than colorful SaaS decoration.
  - Real structured collections support compact subject tables with class-scoped predicates; individual knowledge/source resources prioritize readable detail. Ordinary files retain file/detail behavior.

## Personas and jobs

- Primary personas:
  - Individual user chatting with Secretary to get work done.
  - Developer/operator using Local or Standalone storage and verifying where data lands.
  - Power user coordinating Symphony workers, approvals, and workspace outputs.
  - Knowledge worker browsing files, structured resources, source-linked cards, evidence, and generated artifacts in a Pod.
- User jobs:
  - Sign in with minimal friction: remembered accounts continue directly; first-time undefineds users choose Cloud or Local data space; third-party account providers do not expose a storage picker.
  - Chat with Secretary and keep work grounded in a conversation/workspace.
  - Approve or reject risky actions inline.
  - Re-enter important context through contacts, files, favorites, inbox, and audit.
  - Browse, inspect, edit, and link Pod files/resources without losing storage, provenance, or permission context.
  - Configure Local public reachability later without changing canonical storage identity.
- Key contexts of use: Desktop daily workflow, first-run login, Local runtime startup, long-running AI work, cross-device review, Pod-backed record lookup, structured Files review, worker handoff and recovery.

## Information architecture

| Primary entry | User job | Stable supporting entrances |
|---|---|---|
| 工作 / Work | Human and AI conversation, ongoing tasks, waiting decisions, outcomes | Conversation view; 协作对象 address book; current materials/results |
| 知识 / Knowledge | Find materials, inspect sources, confirm and revise knowledge | Files/resource browser; confirmed/to-organize views; 已收藏 |
| 我的 AI / My AI | Define methods and inspect personal models, materials, evaluation and use | Agent method details; current/candidate versions; scope and rollback |

- Returning users restore the last legal identity/space/module/object/reading or editing context. First use starts in Work. Never turn every conversation into a Task/Issue.
- Contacts remain reachable through Work's fixed address-book entrance, new conversation, participants and search. Humans/groups/Agents are distinct; a personal model or temporary worker is not another contact.
- Favorites are reference indexes, not knowledge confirmation or training consent. Knowledge and training each have their own deliberate transition.
- Inbox stays global. Account/settings/service/about and AI connections remain low-frequency entrances; a current blocker can deep-link to repair and return.
- Old Chat/Contacts/Files/Favorites deep links resolve the same resource IDs/URIs through the new structure. Labels do not imply resource migrations or schema changes.
- Long sources, methods, materials and evaluations can own the main content area. Conversation context survives entry and return; no permanent empty detail or training sidebar.

Content priority: the active object and decision; its evidence, conditions and consequences; relevant source, permission and actual runtime/model state; then diagnostics. Known normal states stay quiet.

## Personal methods and model boundaries

- My AI exposes default methods and current-work overrides, with inheritance, scope, diff, save/discard and return. Changing method does not grant new tool/data/external-service/training permission.
- `docs/secretary/auto-symphony-contract.md` defines a single auto switch for permitted progression. It does not change backend approval; do not invent manual/safe/container levels. One-time approval, persistent grant, method and model enablement remain distinct.
- `docs/approval-grant-design.md` is missing in this checkout. New permission behavior requires the domain owner's authority; do not invent policy in a UI spec.
- Personal models are executable artifacts, distinct from knowledge/RAG/prompts and provider credentials. Real candidates need same-knowledge baseline evaluation on held-out new tasks; no improvement can mean retaining the existing model. Candidate creation is not automatic enablement.
- Foundry owns training/evaluation/release governance. LinX is the daily work and editing surface; Xpod owns assets and runtime management. Do not duplicate knowledge editors or training forms in both products.
- Display configured, service-ready, client-loaded and Run-used model facts separately. Missing default configuration is a repair state, not permission to silently rotate providers. If a personal model is unavailable, say it is not applied; offer stop, repair or clearly identified base-model continuation within granted scope. Never claim the personal model was used.

## Design principles

- Principle 1: **Familiar conversation, task-appropriate surfaces.** Lists, search, object directness and low setup burden remain familiar; source reading, method editing and evaluation do not have to fit inside chat.
- Principle 2: **Visual discipline from macOS-native UI.** Chrome stays quiet; borders, typography, and spacing carry structure; accent is sparse and semantic.
- Principle 3: **Semantics belong to LinX.** Secretary, Pod, workspace, runtime, approval, audit, Symphony, Personal Linked Context, vocab, and Ingest are product concepts, not copied from messaging or OS references.
- Principle 4: **State must be legible.** If storage, auth, local reachability, runtime/backend state, access, proposal state, Ingest state, retry, timeout, or worker state matters, show it explicitly and locally.
- Principle 5: **Files is resource-first.** Finder/File Browser familiarity is used for browsing and opening resources; card/predicate/table/whiteboard patterns appear only where structured resources justify them.
- Principle 6: **File-primary plus modeled metadata.** Long reports, evidence, ideas, issues, and rich notes remain files; modeled RDF records provide queryable type/status/links/authority and point to those files.
- Tradeoffs:
  - Prefer fewer visible modules over exposing half-finished capability.
  - Keep current-work decisions close to their evidence; use the main reading/editing/comparison area when an inline control is too small.
  - Prefer neutral surfaces and restrained state colors over brand-heavy decoration.
  - Keep Files operational and dense enough for resource management; reserve card/whiteboard affordances for structured-resource workflows.
  - Prefer transparent waiting/error/approval state over a visually cleaner but silent AI experience.

## Files and Personal Linked Context

- Files mental model: File Browser/Finder-like browsing for folders, files, selection, rename/move/copy, preview, keyboard expectations, and permission access; it remains a Pod/Solid resource browser, not a local Finder replacement.
- Personal Linked Context: user-owned files, conversations, tasks, evidence, decisions, preferences, and memories become linked, AI-usable context. The Pod behaves like a model-defined semantic file system: human-readable files plus queryable RDF semantics.
- Structured resources: real collections may use subject tables; each row represents one RDF subject/resource, with class scope and actual predicates. An individual source or knowledge card should open a readable detail, not become a table solely because it is RDF.
- Card model: a card is a file/resource plus queryable RDF metadata. Do not introduce a parallel card database when the Pod resource can be the durable subject.
- `.meta` / `.acl` / `.acr`: these are sidecars and built-in resource capabilities, not normal business metadata rows. `.meta` can hold file/container view metadata, source hints, checksums, title, or UI view state; business truth such as Issue/Task/Run/Report/Evidence belongs in modeled resources.
- Vocab: user Pod vocabulary lives under `/.vocab/` with term, shape, and namespace resources. Table columns, validation, sorting, enum/select controls, and cell proposals use actual predicate URIs; local term records support labels, approval, descriptions, shapes, and provenance.
- Structured editing: ordinary `.data` subject values may be edited from Files, but AI/user-suggested class, predicate, enum, shape, or cell changes stage proposals and Inbox approvals before canonical RDF is modified. Pending markers indicate unconfirmed definitions or values, not decoration.
- Ingest: Ingest is the LinX product pipeline that turns source material into reviewable Files objects: cards, blocks, subjects, predicates, vocab proposals, approvals, and source-linked updates. Lower-level fetch/OCR/parser/extraction belongs to runtime/xpod; UI copy should not expose parser/index as the user-facing product concept.
- Projections: Table, Kanban, Whiteboard and Raw are task-appropriate projections over the same subject/resource data and view metadata, not separate durable authorities. A collection may default to Table; not every knowledge object is a collection.
- Subject opening: table/Kanban/Whiteboard subject clicks preview first; Enter, double-click, or explicit open enters the Files resource opening flow only when the subject resolves to a Pod resource path. Fragment subjects and term targets stay in definition/peek flows unless the user explicitly opens the containing resource.
- Chat files: the `聊天文件` scope consumes chat message `richContent` file blocks and explicit runtime artifact containers (`artifacts`, `files`, `generatedFiles`, `outputs`, `resources`, `attachments`). Files must not infer generated files by regexing stdout, assistant prose, tool names, or local workspace paths.

## Visual language

- Color:
  - Neutral surfaces are the foundation: light/dark app backgrounds, cards, panels, separators, and muted text.
  - The selected 2026-09-27 brand uses ink purple `#563E84` on paper `#F7F4ED`, with `#F2EDE2` sunken and `#FBFAF7` raised surfaces; text is `#2B2621` and muted text `#655D53`. Use the accent sparingly for actions, selection, focus and source markers. This supersedes the former `#735FC4` target; shared theme mapping remains a later implementation task.
  - Success/warning/destructive colors are semantic and quiet. Do not create a broad secondary accent palette.
  - Avoid decorative gradients, colored shadows, or emotion-led accent systems as brand identity. Ink purple marks relevant actions, selection, focus and source lineage; it is not a decorative wash.
- Typography:
  - Use system fonts first: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Inter`, `Segoe UI`, `sans-serif`.
  - Use measured weight steps: 400 body, 500 controls, 600 headings/emphasis.
  - Keep dense desktop text readable; do not use oversized marketing typography inside workflow chrome.
- Spacing/layout rhythm:
  - Use compact desktop density where it improves scan speed.
  - Preserve enough padding around cards, dialogs, and primary decisions to avoid cramped operational flows.
  - Conversation list, file list, structured table, and split panes should align to predictable rows and columns.
- Shape/radius/elevation:
  - Radius is tiered by component role, not one global “friendly” radius.
  - Dense lists and rows use small radius or square row edges.
  - Cards/dialogs use moderate radius.
  - Pills are reserved for badges, chips, and compact actions.
  - Use border-led containment and surface contrast before shadow. Shadows are shallow and rare.
- Motion:
  - Motion is functional: loading, panel entry, hover/press/focus response, stream/wait state, proposal/approval state change.
  - Keep transitions short and subtle; respect reduced motion.
- Imagery/iconography:
  - Use simple line icons for navigation and status.
  - Local/Standalone/Cloud badges should be visually distinct but restrained.
  - Do not rely on emoji as core status semantics.

## Components

- Existing components to reuse:
  - Current React + Tailwind + shadcn-style primitives.
  - Login/provider rows, modal shells, settings form controls, chat list panes, status badges, reachability summaries.
  - Files drawers, dialogs, table shells, sidecar patterns, and existing icon primitives when present.
- New/changed component direction:
  - Rename future design language around `surface`, `panel`, `action`, `status`, and `accent` semantics.
  - Treat earlier emotion-led utility classes/comments as implementation cleanup targets, not design guidance.
  - Provider/status components must show storage space and runtime state consistently across login, consent, settings, and account card.
  - AI runtime components must show backend/model/tool/wait/retry/timeout/interrupt/approval state without leaking internal prompt wrappers.
  - Files table work should use headless table state and LinX-owned table UI primitives instead of growing page-level handcrafted table state.
  - Editable file/card sheets should use a rich editor surface only where editing is required; readonly resources should stay preview/detail-first.
- Variants and states:
  - Loading/checking/starting/waiting/retrying/interrupting.
  - Ready/connected/local-only/offline.
  - Selected/unselected/current provider/current resource.
  - Approval pending/approved/rejected/expired.
  - Error/mismatch/conflict/timeout/no-content.
  - Files-specific pending `*`, locked vocab, read-only control resource, source-updated, stale Ingest, no-access, and `.meta` unavailable states.
- Token/component ownership:
  - `docs/ui-style-guide.md` owns visual token rules.
  - `docs/ui-component-architecture.md` owns component layering.
  - Feature docs own flow-specific states and acceptance criteria.

## Accessibility

- Target standard: WCAG 2.1 AA for core desktop/web flows.
- Keyboard/focus behavior:
  - All navigation, dialogs, provider choices, chat controls, file rows, table cells, drawers, and approval cards must be keyboard reachable.
  - Focus states use a clearly visible solid outline with sufficient contrast; selection has a marker/text/shape beyond color. Modal focus enters, stays appropriately constrained and returns to its trigger.
  - Back/cancel/switch-account actions must remain available during provider selection, Local preparation, and auth handoff.
  - Files table subjects support preview on selection and explicit open through Enter/double-click/open action.
  - Long-running AI work has an interrupt affordance and visible waiting state.
- Contrast/readability:
  - Text and status indicators must meet contrast requirements in light and dark modes.
  - Status must not rely on color alone.
- Screen-reader semantics:
  - Buttons and icon-only controls need text labels or ARIA labels.
  - Loading and error states identify what is happening in user terms. Announce meaningful stages and waits, not every streamed token/tool log.
  - Structured grids should expose row/column semantics where practical.
- Reduced motion and sensory considerations:
  - Avoid looping decorative animation.
  - Provide reduced-motion-compatible transitions.

## Responsive behavior

- Supported breakpoints/devices:
  - Primary: desktop shell and desktop web.
  - Secondary: tablet/narrow browser support for review and settings.
  - Mobile is not the primary optimization target unless a feature explicitly states it.
- Layout adaptations:
  - Start with navigation plus content. Add a real collection list when useful and details on demand; wide screens do not require three/four occupied columns.
  - Narrow layouts collapse supporting panes before reducing chat or table readability.
  - Compact resource views do not show global rail, file tree and resource simultaneously. Collapse optional navigation/tree into invoked surfaces while keeping a visible way back and preserving selection.
  - Login and settings flows remain usable without exposing advanced configuration in the primary path.
  - Files right drawers collapse by default; focused editable sheets own their bottom metadata tail.
  - Validate 1440/1180/768/390 CSS px and 200% text. Comparisons become sequential in narrow windows; never shrink all columns or require one section per viewport.
- Touch/hover differences:
  - Do not hide essential actions behind hover-only affordances.
  - Keep touch targets large enough when desktop web is used on touch devices.

## Interaction states

- Loading:
  - State text must name the operation: starting Local service, checking runtime, verifying identity, syncing WebID, preparing Secretary, creating Pod, loading file metadata, preparing Ingest, waiting for backend, calling tool, retrying, or dispatching worker.
  - If a service is already ready, do not flash startup screens.
  - Streaming/waiting indicators must not become regular assistant messages or stale chat content.
- Empty:
  - Empty chat, no Pod, no local public URL, no files, no structured rows, no chat file records, and no favorites each need a specific next action.
- Error:
  - Explain the user-facing problem first, then include technical detail where useful.
  - Never silently fall back from Local/Standalone to Cloud data.
  - Query or Pod failures should fix repository/schema/permissions/SPARQL paths rather than hiding the problem behind fake UI fallback.
  - AI request failures must identify whether the visible problem is auth, gateway/platform, model request validation, timeout, retry exhaustion, no-content response, or local interrupt.
- Success:
  - Confirm what changed and where it was stored.
  - Keep confirmations concise; do not celebrate routine actions.
- Disabled:
  - Disabled controls need a nearby reason when the reason is not obvious.
- Offline/slow network:
  - Local/LAN capability should remain available when public reachability is unavailable.
  - Public route failures belong in reachability diagnostics, not as login blockers unless the selected flow requires public access.
  - Local network settings may record multiple access/tunnel profiles, but the runtime must show exactly one active profile; switching profiles is an explicit stop-old/start-new action followed by reachability validation.

## Partial readiness, drafts and identity

Authentication, verified space binding, Pod read/write, assistant bootstrap, model connection and personal model existence are separate facts. Missing optional training is normal. Show a local repair action for the failing dependency; do not block already permitted reading or silently switch storage. Retry reuses the existing resource identity.

Method/material/evaluation drafts have save/discard/continue-editing behavior and identity+space isolation. Beginning logout/switch hides old content and ends old UI subscriptions; late results cannot appear under the new identity. Returning restores only that identity's legal context. Logout or closing a page is not confirmation that a remote Run or training job stopped.

Source deletion, access revocation, offline failure and revision are distinct. Cross-product repair returns to the original object and rereads authority/version facts; unknown results are queried before retrying side effects. Details follow the profile/settings and login specs.

## Content voice

- Tone: Direct, concise, operational, calm.
- Terminology:
  - Use `undefineds 账号`, `云端空间`, and `本机空间` in the compact login modal. Reserve Standalone/Custom/provider terminology for settings, diagnostics, or non-primary flows.
  - Use storage, workspace, Pod, Secretary, approval, inbox, file, contact, runtime, backend, model, vocab, class, predicate, shape, card, and Ingest where those terms are product-relevant.
  - Use `Ingest record` / `Ingest 记录` for source progress state in UI. Keep `SourceIngestManifest` and `manifest.ttl` as RDF/storage implementation terms.
  - Reserve low-level terms like issuer/storage provider/canonical URL/parser/index for settings, diagnostics, legacy compatibility, and technical docs.
- Microcopy rules:
  - Say what is happening, where data is stored, and what the user can do next.
  - Avoid cute phrasing, anthropomorphic reassurance, or vague error language.
  - Prefer “无法连接这个空间。请确认本地服务已启动。” over “出了点小问题”.
  - Prefer “仍在等待 backend 响应，可按 Esc 中断。” over silent no-response or a chat message that looks like AI content.

## Implementation constraints

- Framework/styling system: React + Tailwind + existing shadcn-style primitives.
- Design-token constraints:
  - Do not add a parallel design-system dependency for this direction.
  - Extend existing CSS variables/tokens toward neutral surfaces, sparse ink-purple accent, border-led containment, and semantic state colors.
- Performance constraints:
  - Desktop startup and login must avoid unnecessary runtime restarts and repeated downloads.
  - Network/reachability probes should be explicit or tied to visible status surfaces, not hidden polling loops.
  - Files Ingest is lazy and progressive; opening an unchanged source-linked subject must not force a new full ingest.
  - AI waiting/retry/status rendering should be lightweight and must not block input recovery.
- Compatibility constraints:
  - Local canonical URL and storage identity must stay aligned with `docs/local-sp-domain-and-tunnel.md` and Solid semantics.
  - Pod data access must follow `docs/pod-interaction-layering.md` and shared models contracts.
  - Structured Pod data must move toward `@undefineds.co/models` / `drizzle-solid` schema, repository, and collection paths; Files-local RDF contracts are first-phase boundaries, not permanent shared semantics.
  - `parser` / `index` names remain accepted only as legacy RDF/API aliases for existing Files-local data.
  - Internal Symphony/Secretary prompt wrappers, worker routing instructions, and xpod guardrails are runtime projection, not product message content.
- Test/screenshot expectations:
  - Use Electron debugger / Playwright screenshots for desktop visual verification when UI changes are made.
  - Add or update tests for login/provider/storage behavior when those flows change.
  - Files changes should include focused tests for structured table behavior, pending proposal hydration, source-linked card/Ingest record handling, and access/meta drawer behavior when those areas change.
  - AI work-state changes should cover no-content, retry, timeout, interrupt, approval, and Symphony worker handoff states.

## Open questions

- [ ] Whether Cloud will later return a Cloudflare one-click setup URL for assigned Local domains / owner: xpod / impact: Local network settings UX.
- [ ] Whether status-badge visual tokens should live only in app CSS or move to shared component primitives / owner: web UI / impact: cross-surface consistency.
- [ ] Whether mobile web should become a first-class shell or remain a secondary review surface / owner: product / impact: navigation and responsive design.
- [ ] Exact default container strategy for source-linked cards when the source belongs to multiple workspaces / owner: Files / impact: migration, re-entry, and search semantics.
- [ ] Which Files-local structured RDF contracts should be promoted first into `@undefineds.co/models` / `drizzle-solid` / owner: models + Files / impact: cross-app consistency.
