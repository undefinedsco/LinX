# Active Work Steering Control Record

## Status
Active steering update.

## Scope
Retarget active work from a login fix toward chat list loading, if both belong to the same user-visible recovery path.

## Current Truth
There is existing active work framed as a login fix. The new instruction changes the immediate target to chat list loading and must be compared against the active work record before dispatch.

## Active Work
Steer the current work item only if chat list loading is the next failing symptom after login. If unrelated, create a separate issue rather than overwriting the login fix.

## Compatibility Impact
Behavior change within active execution only. No product contract is breaking unless the login flow or chat data-loading semantics are changed.

## Evidence
User intent: active-work steering from login fix to chat list loading. Relevant areas include login recovery and chat list data loading.

## Open Questions
Is login now verified and the remaining failure chat-list loading, or is chat-list loading blocked by unresolved login/session state?

## Next Step
Update the active work control record with the steering note, then verify login state before assigning chat-list loading work.

## Related Docs
- `docs/cli-login-and-key-principles.md`
- `docs/chat-module-alignment.md`
- `docs/symphony-system-evolution-control-plane.md`

## Acceptance Summary
Accepted as steering, not a brand-new task, pending verification of whether chat loading depends on the login fix.
