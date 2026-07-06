# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-07-06
- Primary product surfaces: Desktop/Web shell, chat, contacts, files, favorites, inbox, settings, login/onboarding, Local/Standalone/Cloud runtime status, Secretary/Symphony control surfaces.
- Evidence reviewed: `docs/ui-style-guide.md`, `docs/ui-component-architecture.md`, `docs/desktop-product-strategy.md`, `docs/local-sp-domain-and-tunnel.md`, `docs/login-modal-local-binding-spec.md`, `docs/personal-linked-context.md`, `docs/prototype/module-files.md`, `docs/cli-status-line.md`, `apps/web/src/modules/login/LoginModal.tsx`, `apps/web/src/modules/login/LocalOnboardingCard.tsx`, `apps/web/src/modules/settings/components/SetupView.tsx`, `apps/web/src/modules/chat/components/ChatListPane.tsx`; Open Design reference slugs `apple`, `premium`, `wechat`, `linear-app`, `raycast`, `notion`, `github`, `openai`, `claude`.

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
  - Make chat the default workspace for human + AI collaboration.
  - Keep WeChat-like desktop interaction structure: low cognitive load, object lists, current conversation, files/favorites/inbox as re-entry surfaces.
  - Keep macOS-native visual discipline: restrained chrome, neutral surfaces, sparse accent, border-led separation, system typography, subtle motion.
  - Make Pod/storage/runtime/approval/Secretary behavior understandable without requiring users to learn internal architecture first.
  - Make Files a resource-first Pod browser and Personal Linked Context surface: ordinary files stay file-primary, structured RDF resources become queryable/editable views, and long documents remain human-editable files linked from modeled resources.
  - Make AI work state visible, interruptible, and traceable: backend/model, tool calls, retries, timeout, auto-mode, Symphony handoff, approvals, and waiting states must not disappear.
- Non-goals:
  - Recreating WeChat visuals, colors, or social product semantics.
  - Building an Apple-branded interface or copying Apple proprietary assets.
  - Exposing every AI/runtime capability as a separate top-level product area.
  - Turning Local tunnel/network setup into a required login step.
  - Treating audit, keys, models, diagnostics, or low-frequency recovery screens as primary navigation.
  - Duplicating modeled Pod resources in a parallel app-local card/table authority.
- Success signals:
  - A first-time user can start from chat without reading architecture docs.
  - A returning user can identify where data is stored, what runtime/backend is active, and why the AI is waiting or retrying.
  - Approval, inbox, favorites, files, and audit all return users to the original chat/workspace context.
  - Visual review finds restrained, native-feeling UI rather than colorful SaaS decoration.
  - Structured `.ttl` / `.jsonld` resources open as compact subject tables with class-scoped predicates, while ordinary files open with familiar file/detail behavior.

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

- Primary navigation:
  - Chat is the primary stage.
  - Contacts, files, favorites, and settings are supporting surfaces.
  - Inbox is a right-side/global exception center, not a competing main app.
  - Audit, keys, models, diagnostics, network reachability, and low-frequency recovery/configuration surfaces live in settings, slash commands, or contextual drawers rather than top-level app navigation.
- Core routes/screens:
  - Compact login modal, remembered-account continue, account-provider selection, and undefineds-only Cloud/Local data-space selection.
  - Conversation list and chat content pane.
  - Contact/agent/group detail.
  - File/resource browser with folder tree, resource list/detail, `.meta` inspector, Access control, structured RDF Table, and first-phase Kanban/Whiteboard/Raw projections.
  - Chat files projection from message `richContent` file/artifact records, not text/log guessing.
  - Favorites/re-entry index.
  - Inbox/approval queue.
  - Settings for runtime, Local network, account, models/backends, keys, diagnostics, and advanced configuration.
- Content hierarchy:
  - First: current conversation and active object.
  - Second: workspace/storage/runtime/backend context needed to understand the conversation.
  - Third: approvals, source/provenance, model/schema, and permission details relevant to the current action.
  - Fourth: global recovery surfaces and advanced configuration.

## Design principles

- Principle 1: **Interaction skeleton from desktop messaging.** Lists, conversation panes, search, object directness, and low setup burden should feel familiar.
- Principle 2: **Visual discipline from macOS-native UI.** Chrome stays quiet; borders, typography, and spacing carry structure; accent is sparse and semantic.
- Principle 3: **Semantics belong to LinX.** Secretary, Pod, workspace, runtime, approval, audit, Symphony, Personal Linked Context, vocab, and Ingest are product concepts, not copied from messaging or OS references.
- Principle 4: **State must be legible.** If storage, auth, local reachability, runtime/backend state, access, proposal state, Ingest state, retry, timeout, or worker state matters, show it explicitly and locally.
- Principle 5: **Files is resource-first.** Finder/File Browser familiarity is used for browsing and opening resources; card/predicate/table/whiteboard patterns appear only where structured resources justify them.
- Principle 6: **File-primary plus modeled metadata.** Long reports, evidence, ideas, issues, and rich notes remain files; modeled RDF records provide queryable type/status/links/authority and point to those files.
- Tradeoffs:
  - Prefer fewer visible modules over exposing half-finished capability.
  - Prefer inline chat actions over sending users to system pages for current-work decisions.
  - Prefer neutral surfaces and restrained state colors over brand-heavy decoration.
  - Keep Files operational and dense enough for resource management; reserve card/whiteboard affordances for structured-resource workflows.
  - Prefer transparent waiting/error/approval state over a visually cleaner but silent AI experience.

## Files and Personal Linked Context

- Files mental model: File Browser/Finder-like browsing for folders, files, selection, rename/move/copy, preview, keyboard expectations, and permission access; it remains a Pod/Solid resource browser, not a local Finder replacement.
- Personal Linked Context: user-owned files, conversations, tasks, evidence, decisions, preferences, and memories become linked, AI-usable context. The Pod behaves like a model-defined semantic file system: human-readable files plus queryable RDF semantics.
- Structured resources: `.ttl`, `.jsonld`, and RDF resources default to a subject table. One row represents one RDF subject/resource; `rdf:type` is surfaced as required class scope; predicates become compact columns.
- Card model: a card is a file/resource plus queryable RDF metadata. Do not introduce a parallel card database when the Pod resource can be the durable subject.
- `.meta` / `.acl` / `.acr`: these are sidecars and built-in resource capabilities, not normal business metadata rows. `.meta` can hold file/container view metadata, source hints, checksums, title, or UI view state; business truth such as Issue/Task/Run/Report/Evidence belongs in modeled resources.
- Vocab: user Pod vocabulary lives under `/.vocab/` with term, shape, and namespace resources. Table columns, validation, sorting, enum/select controls, and cell proposals use actual predicate URIs; local term records support labels, approval, descriptions, shapes, and provenance.
- Structured editing: ordinary `.data` subject values may be edited from Files, but AI/user-suggested class, predicate, enum, shape, or cell changes stage proposals and Inbox approvals before canonical RDF is modified. Pending markers indicate unconfirmed definitions or values, not decoration.
- Ingest: Ingest is the LinX product pipeline that turns source material into reviewable Files objects: cards, blocks, subjects, predicates, vocab proposals, approvals, and source-linked updates. Lower-level fetch/OCR/parser/extraction belongs to runtime/xpod; UI copy should not expose parser/index as the user-facing product concept.
- Projections: Table is the default structured view. Kanban, Whiteboard, and Raw are projections over the same subject/resource data and view metadata, not separate durable authorities.
- Subject opening: table/Kanban/Whiteboard subject clicks preview first; Enter, double-click, or explicit open enters the Files resource opening flow only when the subject resolves to a Pod resource path. Fragment subjects and term targets stay in definition/peek flows unless the user explicitly opens the containing resource.
- Chat files: the `聊天文件` scope consumes chat message `richContent` file blocks and explicit runtime artifact containers (`artifacts`, `files`, `generatedFiles`, `outputs`, `resources`, `attachments`). Files must not infer generated files by regexing stdout, assistant prose, tool names, or local workspace paths.

## Visual language

- Color:
  - Neutral surfaces are the foundation: light/dark app backgrounds, cards, panels, separators, and muted text.
  - Linked-data taro purple (`#735FC4`, `hsl(252 46% 57%)`) is the shared Solid app family accent. Use it for primary action, selected state, focus ring, lineage/source-linked markers, and rare brand moments only.
  - Success/warning/destructive colors are semantic and quiet. Do not create a broad secondary accent palette.
  - Avoid decorative gradients, colored shadows, or emotion-led accent systems as brand identity. The taro accent should appear as data-family recognition, not decoration.
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
  - Focus states use a visible, restrained accent ring.
  - Back/cancel/switch-account actions must remain available during provider selection, Local preparation, and auth handoff.
  - Files table subjects support preview on selection and explicit open through Enter/double-click/open action.
  - Long-running AI work has an interrupt affordance and visible waiting state.
- Contrast/readability:
  - Text and status indicators must meet contrast requirements in light and dark modes.
  - Status must not rely on color alone.
- Screen-reader semantics:
  - Buttons and icon-only controls need text labels or ARIA labels.
  - Loading and error states should identify what is happening in user terms.
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
  - Desktop uses split navigation/list/content panes.
  - Narrow layouts collapse supporting panes before reducing chat or table readability.
  - Files compact width must not show global rail + file tree + resource content at the same time. Hide the global rail, put the file tree in an invoked drawer, and keep the active resource/table readable.
  - Login and settings flows remain usable without exposing advanced configuration in the primary path.
  - Files right drawers collapse by default; focused editable sheets own their bottom metadata tail.
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
  - Extend existing CSS variables/tokens toward neutral surfaces, sparse linked-data taro accent, border-led containment, and semantic state colors.
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
