# LinX Web Chat P0 QA Report

- Date: 2026-08-02
- Scope: ChatKit attachments, cancellation propagation, feedback persistence
- Result: automated and real-Pod verification passed; full browser interaction blocked by the pre-existing local models checkout mismatch

## Verified

- ChatKit attachment configuration uses the SDK's native two-phase upload UI.
- Binary upload path is `attachments.create -> local PUT -> authenticated Pod PUT`.
- A bootstrapped xpod accepted the bytes, returned the exact content, and removed it on delete.
- ChatKit request `AbortSignal` reaches the local service and external provider/runtime fetch calls.
- Aborted generations are archived as `incomplete` without emitting a user-visible generation error.
- Feedback is applied to the referenced item and persisted through the existing rich-content path.
- Attachments are included in the saved user-message rich content so their references survive message reload.

## Test evidence

- Focused unit/component suite: 6 files, 52 tests passed.
- Real xpod integration: 1 file, 1 test passed.
- Target source ESLint: 0 errors.
- `git diff --check`: passed.

## Browser verification

- Local xpod at `http://localhost:5737/` responded with HTTP 200.
- Local OIDC login and authorization completed successfully in the browser.
- The Web chat shell loaded and accepted a secretary draft.
- Submission could not reach ChatKit: the draft remained in "waiting for default thread" state and the secretary bootstrap timed out after 10 seconds.
- Browser logs showed the concrete data failure: the thread collection query attempted to select an undefined column (`Unable to resolve column reference for select field: undefined`). Notification-channel fetch failures were also present.

## Blocking environment mismatch

The current workspace cannot complete the browser chat flow because its model sources are inconsistent:

- Vite automatically aliases `@undefineds.co/models` to the legacy local `packages/models` checkout when that directory exists. That checkout does not export `inputRequestResource`, so the app fails during module loading.
- Using the installed 0.2.45 package allows the shell to render, but its thread model exposes `parent` while the current Web collection selects `chat`. The resulting invalid query prevents the default thread from being created.

The same mismatch also causes pre-existing ChatKit store tests and the repository-wide TypeScript check to fail. No shared-model checkout, dependency version, or unrelated model code was changed as part of this task. Browser acceptance is therefore **blocked**, not passed.
