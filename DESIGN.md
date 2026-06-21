# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-06-21
- Primary product surfaces: Desktop/Web shell, chat, contacts, files, favorites, inbox, settings, login/onboarding, Local/Standalone/Cloud runtime status, Secretary/Symphony control surfaces.
- Evidence reviewed: `docs/ui-style-guide.md`, `docs/ui-component-architecture.md`, `docs/desktop-product-strategy.md`, `docs/local-sp-domain-and-tunnel.md`, `apps/web/src/modules/login/LoginModal.tsx`, `apps/web/src/modules/login/LocalOnboardingCard.tsx`, `apps/web/src/modules/settings/components/SetupView.tsx`, `apps/web/src/modules/chat/components/ChatListPane.tsx`, `/tmp/open-design-apple/DESIGN.md`.

This file is the design contract for LinX user-facing product work. It supersedes earlier local-only login guidance and earlier emotion-led brand language.

## Brand

- Personality: Precise, calm, trustworthy, native-feeling AI workspace. LinX should feel operationally clear before it feels decorative.
- Trust signals: Make storage location, active provider, runtime readiness, workspace binding, approval state, and Secretary action explicit at the point where the user needs them.
- Avoid:
  - Treating LinX as a WeChat clone or applying WeChat brand skin.
  - Treating macOS / Apple references as assets to copy. Use platform discipline, not Apple identity.
  - Broad purple SaaS styling, decorative gradients, glow, heavy shadow, noisy emoji state, or cuteness-heavy microcopy.
  - Hiding infrastructure state behind vague progress text.
  - Showing Cloud data when the user selected a Local/Standalone storage space.

## Product goals

- Goals:
  - Make chat the default workspace for human + AI collaboration.
  - Keep WeChat-like desktop interaction structure: low cognitive load, object lists, current conversation, files/favorites/inbox as re-entry surfaces.
  - Keep macOS-native visual discipline: restrained chrome, neutral surfaces, sparse accent, border-led separation, system typography, subtle motion.
  - Make Pod/storage/runtime/approval/Secretary behavior understandable without requiring users to learn internal architecture first.
- Non-goals:
  - Recreating WeChat visuals, colors, or social product semantics.
  - Building an Apple-branded interface or copying Apple proprietary assets.
  - Exposing every AI/runtime capability as a separate top-level product area.
  - Turning Local tunnel/network setup into a required login step.
- Success signals:
  - A first-time user can start from chat without reading architecture docs.
  - A returning user can identify where data is stored and what runtime is active.
  - Approval, inbox, favorites, files, and audit all return users to the original chat/workspace context.
  - Visual review finds restrained, native-feeling UI rather than colorful SaaS decoration.

## Personas and jobs

- Primary personas:
  - Individual user chatting with Secretary to get work done.
  - Developer/operator using Local or Standalone storage and verifying where data lands.
  - Power user coordinating Symphony workers, approvals, and workspace outputs.
- User jobs:
  - Choose Cloud, Local, Standalone, or Custom storage with clear consequences.
  - Chat with Secretary and keep work grounded in a conversation/workspace.
  - Approve or reject risky actions inline.
  - Re-enter important context through contacts, files, favorites, inbox, and audit.
  - Configure Local public reachability later without changing canonical storage identity.
- Key contexts of use: Desktop daily workflow, first-run login, Local runtime startup, long-running AI work, cross-device review, Pod-backed record lookup.

## Information architecture

- Primary navigation:
  - Chat is the primary stage.
  - Contacts, files, favorites, and settings are supporting surfaces.
  - Inbox is a right-side/global exception center, not a competing main app.
- Core routes/screens:
  - Provider/storage selection.
  - Conversation list and chat content pane.
  - Contact/agent/group detail.
  - File/workspace asset browser.
  - Favorites/re-entry index.
  - Inbox/approval queue.
  - Settings for runtime, Local network, account, and advanced configuration.
- Content hierarchy:
  - First: current conversation and active object.
  - Second: workspace/storage/runtime context needed to understand the conversation.
  - Third: global recovery surfaces and advanced configuration.

## Design principles

- Principle 1: **Interaction skeleton from desktop messaging.** Lists, conversation panes, search, object directness, and low setup burden should feel familiar.
- Principle 2: **Visual discipline from macOS-native UI.** Chrome stays quiet; borders, typography, and spacing carry structure; accent is sparse and semantic.
- Principle 3: **Semantics belong to LinX.** Secretary, Pod, workspace, runtime, approval, audit, and Symphony are product concepts, not copied from messaging or OS references.
- Principle 4: **State must be legible.** If storage, auth, local reachability, or runtime state matters, show it explicitly and locally.
- Tradeoffs:
  - Prefer fewer visible modules over exposing half-finished capability.
  - Prefer inline chat actions over sending users to system pages for current-work decisions.
  - Prefer neutral surfaces and restrained state colors over brand-heavy decoration.

## Visual language

- Color:
  - Neutral surfaces are the foundation: light/dark app backgrounds, cards, panels, separators, and muted text.
  - LinX purple is a controlled accent for primary action, selected state, focus ring, and key brand moments only.
  - Success/warning/destructive colors are semantic and quiet. Do not create a broad secondary accent palette.
  - Avoid decorative gradients, colored shadows, or emotion-led accent systems as brand identity.
- Typography:
  - Use system fonts first: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Inter`, `Segoe UI`, `sans-serif`.
  - Use measured weight steps: 400 body, 500 controls, 600 headings/emphasis.
  - Keep dense desktop text readable; do not use oversized marketing typography inside workflow chrome.
- Spacing/layout rhythm:
  - Use compact desktop density where it improves scan speed.
  - Preserve enough padding around cards, dialogs, and primary decisions to avoid cramped operational flows.
  - Conversation list and split panes should align to predictable rows and columns.
- Shape/radius/elevation:
  - Radius is tiered by component role, not one global “friendly” radius.
  - Dense lists and rows use small radius or square row edges.
  - Cards/dialogs use moderate radius.
  - Pills are reserved for badges, chips, and compact actions.
  - Use border-led containment and surface contrast before shadow. Shadows are shallow and rare.
- Motion:
  - Motion is functional: loading, panel entry, hover/press/focus response.
  - Keep transitions short and subtle; respect reduced motion.
- Imagery/iconography:
  - Use simple line icons for navigation and status.
  - Local/Standalone/Cloud badges should be visually distinct but restrained.
  - Do not rely on emoji as core status semantics.

## Components

- Existing components to reuse:
  - Current React + Tailwind + shadcn-style primitives.
  - Login/provider rows, modal shells, settings form controls, chat list panes, status badges, reachability summaries.
- New/changed component direction:
  - Rename future design language around `surface`, `panel`, `action`, `status`, and `accent` semantics.
  - Treat earlier emotion-led utility classes/comments as implementation cleanup targets, not design guidance.
  - Provider/status components must show storage space and runtime state consistently across login, consent, settings, and account card.
- Variants and states:
  - Loading/checking/starting.
  - Ready/connected/local-only/offline.
  - Selected/unselected/current provider.
  - Approval pending/approved/rejected/expired.
  - Error/mismatch/conflict.
- Token/component ownership:
  - `docs/ui-style-guide.md` owns visual token rules.
  - `docs/ui-component-architecture.md` owns component layering.
  - Feature docs own flow-specific states and acceptance criteria.

## Accessibility

- Target standard: WCAG 2.1 AA for core desktop/web flows.
- Keyboard/focus behavior:
  - All navigation, dialogs, provider choices, chat controls, and approval cards must be keyboard reachable.
  - Focus states use a visible, restrained accent ring.
  - Back/change-space actions must remain available after provider or Pod selection.
- Contrast/readability:
  - Text and status indicators must meet contrast requirements in light and dark modes.
  - Status must not rely on color alone.
- Screen-reader semantics:
  - Buttons and icon-only controls need text labels or ARIA labels.
  - Loading and error states should identify what is happening in user terms.
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
  - Narrow layouts collapse supporting panes before reducing chat readability.
  - Login and settings flows remain usable without exposing advanced configuration in the primary path.
- Touch/hover differences:
  - Do not hide essential actions behind hover-only affordances.
  - Keep touch targets large enough when desktop web is used on touch devices.

## Interaction states

- Loading:
  - State text must name the operation: starting Local service, checking runtime, verifying identity, syncing WebID, preparing Secretary, creating Pod.
  - If a service is already ready, do not flash startup screens.
- Empty:
  - Empty chat, no Pod, no local public URL, no files, and no favorites each need a specific next action.
- Error:
  - Explain the user-facing problem first, then include technical detail where useful.
  - Never silently fall back from Local/Standalone to Cloud data.
- Success:
  - Confirm what changed and where it was stored.
  - Keep confirmations concise; do not celebrate routine actions.
- Disabled:
  - Disabled controls need a nearby reason when the reason is not obvious.
- Offline/slow network:
  - Local/LAN capability should remain available when public reachability is unavailable.
  - Public route failures belong in reachability diagnostics, not as login blockers unless the selected flow requires public access.

## Content voice

- Tone: Direct, concise, operational, calm.
- Terminology:
  - Use Cloud, Local, Standalone, Custom for provider surfaces.
  - Use storage, workspace, Pod, Secretary, approval, inbox, file, contact, runtime where those terms are product-relevant.
  - Reserve low-level terms like issuer/storage provider/canonical URL for settings, diagnostics, and technical docs.
- Microcopy rules:
  - Say what is happening and what the user can do next.
  - Avoid cute phrasing, anthropomorphic reassurance, or vague error language.
  - Prefer “无法连接这个空间。请确认本地服务已启动。” over “出了点小问题”.

## Implementation constraints

- Framework/styling system: React + Tailwind + existing shadcn-style primitives.
- Design-token constraints:
  - Do not add a parallel design-system dependency for this direction.
  - Extend existing CSS variables/tokens toward neutral surfaces, sparse accent, border-led containment, and semantic state colors.
- Performance constraints:
  - Desktop startup and login must avoid unnecessary runtime restarts and repeated downloads.
  - Network/reachability probes should be explicit or tied to visible status surfaces, not hidden polling loops.
- Compatibility constraints:
  - Local canonical URL and storage identity must stay aligned with `docs/local-sp-domain-and-tunnel.md` and Solid semantics.
  - Pod data access must follow `docs/pod-interaction-layering.md` and shared models contracts.
- Test/screenshot expectations:
  - Use Electron debugger / Playwright screenshots for desktop visual verification when UI changes are made.
  - Add or update tests for login/provider/storage behavior when those flows change.

## Open questions

- [ ] Whether Cloud will later return a Cloudflare one-click setup URL for assigned Local domains / owner: xpod / impact: Local network settings UX.
- [ ] Whether status-badge visual tokens should live only in app CSS or move to shared component primitives / owner: web UI / impact: cross-surface consistency.
- [ ] Whether mobile web should become a first-class shell or remain a secondary review surface / owner: product / impact: navigation and responsive design.
