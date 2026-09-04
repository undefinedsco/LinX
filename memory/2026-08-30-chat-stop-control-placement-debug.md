# Chat stop control placement debug

## Debug report

- **Symptom:** During generation, LinX rendered a separate `停止生成` pill in the message canvas while ChatKit still showed its composer submit/loading control.
- **Root cause:** ChatKit 1.9 exposes response lifecycle events but no public abort-button rendering hook. LinX therefore owns runtime interruption, but the custom control was positioned as a second action instead of occupying ChatKit's composer action slot.
- **Fix:** `ChatGenerationControl` now renders an opaque circular stop control at the composer bottom-right action position. Its background mask covers the native loading indicator while generation is active; it unmounts after generation so ChatKit regains the slot.
- **Evidence:** `ChatGenerationControl.test.tsx` covers position, shape, accessibility, interrupt callback, and inactive cleanup. All Chat tests (58 files / 395 tests), TypeScript, chat lint, and `git diff --check` pass. Vite serves the updated classes and `/chat` returns HTTP 200; local Xpod is healthy.
- **Status:** DONE_WITH_CONCERNS — code and component behavior are verified; authenticated live visual alignment still needs one long-generation browser pass because the claimed browser tab currently shows the login dialog.
