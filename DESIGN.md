# Design

## Source of truth
- Status: Draft
- Last refreshed: 2026-06-01
- Primary product surfaces: Desktop login overlay, Local onboarding, Service setup, settings.
- Evidence reviewed: `docs/ui-style-guide.md`, `docs/ui-component-architecture.md`, `docs/local-sp-domain-and-tunnel.md`, `apps/web/src/modules/login/LoginModal.tsx`, `apps/web/src/modules/login/LocalOnboardingCard.tsx`, `apps/web/src/modules/settings/components/SetupView.tsx`.

## Brand
- Personality: Warm guardian, calm technical guidance, no mystery around local infrastructure.
- Trust signals: Show the selected space, canonical URL, local/public route status, and next action before opening auth.
- Avoid: Hidden auto-upgrades, ambiguous provider names, pretending tunnel is required when local/LAN can still work.

## Product goals
- Goals: Let users understand where data is stored, start Local without blocking on tunnel setup, and add public reachability later without changing canonical storage identity.
- Non-goals: Replacing Cloudflare dashboard configuration, router DNS automation, or general network diagnostics.
- Success signals: User can see the assigned Local domain, paste tunnel token, test same-node reachability, and still continue login if only local access is ready.

## Personas and jobs
- Primary personas: Individual desktop user running Local xpod; advanced user adding public access; developer verifying Local login routes.
- User jobs: Choose Cloud/Local/Standalone/Custom; obtain Local canonical URL; configure Cloudflare Tunnel; verify Local is reachable; complete login.
- Key contexts of use: First-run desktop login, post-install local runtime setup, later public-access upgrade.

## Information architecture
- Primary navigation: Login overlay remains the first decision point. Settings owns deeper service configuration.
- Core routes/screens: Provider selection, Local onboarding detail, auth waiting surface, `/setup` for service mode.
- Content hierarchy: Space choice first, then runtime status, then domain/tunnel/connectivity, then login.

## Design principles
- Principle 1: Provider selection is a storage-space choice, not a low-level IDP/SP form.
- Principle 2: Local infrastructure is progressive. Local/LAN can work first; tunnel is a visible upgrade path.
- Tradeoffs: Keep a compact login overlay, but allow scroll inside Local details instead of hiding critical setup.

## Visual language
- Color: Follow existing warm-card, primary purple, emerald success, amber warning, destructive failure.
- Typography: Existing app type scale and weights.
- Spacing/layout rhythm: Compact modal spacing, rounded cards, short labels, no dense forms in primary path.
- Shape/radius/elevation: Existing `rounded-xl`/`rounded-2xl`, neutral borders, no new elevation system.
- Motion: Existing spinner and simple hover transitions only.
- Imagery/iconography: Existing lucide icons and LinX/local badges.

## Components
- Existing components to reuse: `LoginCardShell`, login provider rows, settings form controls, existing buttons/input styling.
- New/changed components: Local route info card, tunnel setup card, connectivity card.
- Variants and states: Unknown, checking, ready, local-only, failed, mismatch.
- Token/component ownership: Login overlay owns first-run guidance; settings/service setup owns persistent advanced config.

## Accessibility
- Target standard: Keyboard-accessible buttons and form controls, readable compact text.
- Keyboard/focus behavior: Token input, save, test, copy, and continue are reachable in order.
- Contrast/readability: Status text uses existing semantic colors and does not rely only on icons.
- Screen-reader semantics: Buttons have textual labels.
- Reduced motion and sensory considerations: No new looping motion beyond existing spinners.

## Responsive behavior
- Supported breakpoints/devices: Desktop modal and service setup page.
- Layout adaptations: Local details scroll inside modal when content exceeds height.
- Touch/hover differences: Do not depend on hover-only affordances.

## Interaction states
- Loading: Show concrete xpod startup progress and details.
- Empty: No public URL yet shows "waiting for xpod/Cloud".
- Error: Explain whether the failure is local startup, Cloud binding, or public route reachability.
- Success: Show assigned domain and route readiness before continuing.
- Disabled: Save token is disabled until token text is provided.
- Offline/slow network: Public route can be `local-only`; do not silently switch to Cloud Pod.

## Content voice
- Tone: Direct, concise, operational.
- Terminology: Use Cloud, Local, Standalone, Custom; use `canonical URL` only where storage identity matters.
- Microcopy rules: Say "Cloud 分配的 Local 域名", "Cloudflare Tunnel", "联通性测试", and "继续登录".

## Implementation constraints
- Framework/styling system: React + existing Tailwind/shadcn-style primitives.
- Design-token constraints: Reuse existing tokens and modal shell.
- Performance constraints: Connectivity probes are explicit user actions or startup status, not background polling loops in the login component.
- Compatibility constraints: Local canonical URL semantics must stay aligned with `docs/local-sp-domain-and-tunnel.md`.
- Test/screenshot expectations: Add unit tests for Local domain/tunnel/connectivity controls; use Electron debugger for desktop visual verification when needed.

## Open questions
- [ ] Whether Cloud will later return a Cloudflare one-click setup URL for the assigned domain.
- [ ] Whether token clearing should also revoke/replace persisted xpod Cloud registration.
