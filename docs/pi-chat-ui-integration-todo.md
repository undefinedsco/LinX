# Pi Chat UI Integration TODO

## Goal

Reduce duplicate Chat UI work by adopting Pi's renderer-registry and runtime-event ideas without importing Pi's Lit UI, IndexedDB stores, provider settings, or session identity into LinX.

LinX remains authoritative for:

- Chat, Thread, Message and structured Pod resources
- Solid authentication and xpod transport
- React, Radix and LinX design tokens
- model service configuration and credentials

Pi remains a runtime source. ChatKit, local xpod SSE, Pi and Codex events must be adapted into one LinX presentation model before rendering.

## Architecture

```text
Pi / Codex / ChatKit / xpod SSE
              |
              v
      Runtime event adapters
              |
              v
    LinX presentation messages
              |
              v
   Message block renderer registry
       |       |       |       |
     text   thinking   tool   artifact
              |
              v
        React Chat surfaces
              |
              v
 Pod Chat / Thread / Message collections
```

## Non-goals

- Do not embed Pi `ChatPanel` or `AgentInterface`.
- Do not add Pi IndexedDB session, API-key or settings stores.
- Do not write Pi runtime session ids as Pod Thread ids.
- Do not replace ChatKit or the Pod collection layer in this phase.
- Do not copy Pi's global CSS into LinX.

## Phase 1: renderer foundation

- [x] Add a typed message-block renderer registry.
- [x] Register existing text, thinking, tool, approval, progress, error and placeholder renderers.
- [x] Keep renderer context callbacks explicit instead of hiding state in globals.
- [x] Add unit coverage for built-in dispatch, custom registration and fallback behavior.
- [x] Render Image, File and Citation blocks instead of silently dropping them.
- [x] Add component coverage for Image, File and Citation blocks.
- [x] Add an unauthenticated developer preview route at `/debug/message-blocks` for deterministic browser regression.
- [x] Verify existing Chat pages still render persisted and streaming messages against Docker xpod, including a provider-backed assistant reply and refresh restore.

## Phase 2: presentation adapters

- [ ] Define `ChatPresentationMessage` and `ChatPresentationBlock` contracts in the Web Chat module.
- [ ] Add an xpod SSE adapter for user, assistant delta, completion and error events.
- [ ] Add a ChatKit thread-item adapter.
- [ ] Add a Pi runtime event adapter without importing Pi UI or storage.
- [x] Add the provider-neutral Pi message-content adapter for user text/images, assistant text/thinking/tool calls, tool results and terminal errors.
- [ ] Ensure every adapter preserves stable Pod message ids after optimistic rendering.
- [ ] Consolidate duplicated streaming state from `LocalChatPanel` and custom message surfaces.

## Phase 3: Pi-inspired interaction blocks

- [ ] Align Thinking behavior: streaming, elapsed time, collapsed completion and accessibility.
- [ ] Align Tool behavior: pending, running, result, failure and duration.
- [ ] Add an artifact renderer boundary for Markdown, HTML, SVG and images.
- [ ] Run active HTML artifacts only in the existing sandbox boundary.
- [ ] Lazy-load PDF, DOCX and XLSX preview dependencies rather than adding them to the main Chat bundle.

## Phase 4: surface convergence

- [ ] Make ChatKit and local xpod Chat consume the shared presentation layer.
- [ ] Remove duplicate message rendering only after parity tests pass.
- [ ] Keep runtime controls and inbox approvals as LinX-owned UI.
- [ ] Measure bundle size and long-thread rendering before removing the old path.

## Required tests

### Unit and component

- [x] Renderer registration, override and unregister behavior.
- [x] Unknown block fallback without crashing the full message.
- [x] Pi content-part ordering remains stable and block ids are deterministic.
- [x] Streaming updates preserve block identities and do not duplicate blocks.
- Tool and approval callbacks receive the correct call id.
- Image/File/Citation content is escaped and safe.
- [x] Pi user/assistant/tool-result text, image, thinking, redacted thinking, tool call, success, failure, provider error and aborted formats map to LinX blocks.

### Integration

- xpod SSE deltas become one assistant message.
- Optimistic ids are replaced by persisted Pod ids.
- Refresh restores the same message order and rich blocks.
- Tool result and approval state survive Pod reload.

### Real E2E with Docker xpod

- Log in through the local LinX flow.
- Create or select a Chat and Thread.
- Send a message through the local xpod runtime.
- Observe incremental assistant output and final completion.
- Refresh and verify both messages persist.
- Verify Thinking/Tool/Error blocks render without console errors.
- Verify Chat remains usable at desktop and mobile widths.

## Exit criteria

- No Pi UI/storage dependency is added.
- Pod remains the only durable Chat fact source.
- Existing ChatKit behavior is unchanged.
- Renderer registry and all added blocks have tests.
- Web typecheck, build and full Web test suite pass.
- Real browser E2E passes against Docker xpod with screenshot and console evidence.

## Verification status (2026-07-21)

- [x] Production Web typecheck and build pass.
- [x] Focused Chat persistence/routing tests: 2 files, 12 tests passed after the final query changes.
- [x] Full Web suite after the final query changes: 113 files, 923 tests passed.
- [x] Renderer suite after URL hardening: 11 tests passed.
- [x] Docker `xpod-local` responds on port 5737.
- [x] Docker image rebuilt from the current local xpod source without clearing Pod data.
- [x] Fresh-browser local-login flow redirects to the local xpod account page.
- [x] Latest-source renderer preview verified in Chrome at desktop and mobile widths.
- [x] The Web adapter now uses the rich-content APIs actually published by `@undefineds.co/models@0.2.45`; no private duplicate wire model remains.
- [x] Default Secretary identity is deterministic (`__default__`) and exact Thread restore no longer performs a Pod-wide Thread scan.
- [x] Background Thread/Message collections no longer start duplicate Pod-wide timeline scans; reads are owned by the Chat- and Thread-scoped query paths.
- [x] Published models endpoint compatibility is explicit: Chat, Thread and Message use `/.data/chat/-/sparql` until the Web dependency contains the newer schema defaults.
- [x] Message persistence no longer performs a broad reread after insert/update: deterministic Message IRIs are cached and recent rows are patched directly.
- [x] Chat resolution uses the deterministic Chat resource id and no longer scans/dereferences historical foreign-Pod rows.
- [x] ChatKit exposes enabled Pod model-service models and encodes the explicit provider selection as `provider::model`; the service routes that choice ahead of the Assistant's default LinX model.
- [x] Model verification preserves the just-verified API key and provider relation while writing health fields, preventing a stale React query snapshot from erasing the credential.
- [x] A recoverable Chat-list query failure falls back to the exact/synthetic default Secretary row, so the left list remains usable even while scoped query transport is degraded.
- [x] Authenticated Docker-xpod browser E2E passed: `QA Final Persist / gpt-5.4-mini` returned `E2E-OK`; after a hard reload the user message, assistant reply, model service, and `AI Secretary` list entry remained visible.
- [x] Focused regression suite passed: 68 tests across Chat collections/content, ChatKit storage/routing, and model-service persistence.
- [x] Production Web build passed after the E2E fixes.
- [x] Final full Web suite: 114 files, 931 tests passed; strict `build:check` (stores typecheck, Web typecheck, production bundle) passed.
- [x] Follow-up full Web suite: 115 files, 935 tests passed after Thread composer preference coverage.
- [x] Disposable model-service E2E passed in system Chrome: fresh local login, real seeded xpod, mocked deterministic provider catalog, real provider/credential/model writes, full reload/re-auth, and persisted provider/model restore.
- [x] Follow-up strict Web `build:check` passed (stores typecheck, Web typecheck, production bundle).
- [x] Pi format-matrix unit coverage passes: interleaved content, streaming identity, text/image tool results, provider/tool/aborted failures and redacted thinking.
- [x] Deterministic browser format gallery passes in system Chrome at desktop and mobile widths, including expand/collapse interaction, Markdown safety attributes, rich artifacts, runtime states, zero console errors and zero document-level horizontal overflow.

### Remaining follow-ups

- [x] Persist the last composer model in Thread metadata so refresh restores an available explicit provider selection and safely falls back to LinX Lite if that provider is no longer enabled.
- [x] Keep model-service CRUD verification out of application startup: `yarn test:xpod:model-services` starts an isolated seeded xpod, writes provider/credential/model fixtures, deletes the created subjects, and removes the temporary runtime directory.
- [x] Reuse the CI-owned disposable xpod fixture in `tests/e2e/helpers/seeded-xpod-runtime.ts`; every browser run gets random ports and a temporary Pod root, so credential/provider mutations never depend on a developer's long-lived Pod.

### Maintained verification commands

```bash
# Real drizzle-solid provider/credential/model CRUD against an isolated xpod.
yarn test:xpod:model-services

# Browser login/bootstrap flow against an isolated seeded xpod.
yarn workspace @linx/e2e test:model-services

# Deterministic Pi format and responsive renderer regression in system Chrome.
yarn workspace @linx/e2e test:message-formats
```

The local browser command reuses the installed system Chrome, avoiding a separate Playwright browser download; CI keeps the standard Playwright-managed executable. Neither command deletes data from a developer Pod. The isolated runtime is the reset boundary: stopping the test removes its temporary Pod root.
