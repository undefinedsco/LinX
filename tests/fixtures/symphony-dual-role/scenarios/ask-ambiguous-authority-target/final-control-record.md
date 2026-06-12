# Ambiguous Symphony Dispatch Target Control Record

## Status
Ask state; blocked on target and authority clarification.

## Scope
Control whether a Symphony task should be visible in a team chat or private worker chat. The message may contain secrets, so target selection affects privacy, visibility, and authority.

## Current Truth
The user gave conflicting fragments: first asking for team chat visibility, then suggesting only the backend worker should see it. Visibility and authority are ambiguous, and the user explicitly said not to guess the target.

## Active Work
None. Do not guess the target. Do not dispatch to team chat, do not dispatch to private worker chat, and do not create a worker delivery until the target and authority are explicit.

## Compatibility Impact
Compatible. Waiting for clarification preserves existing privacy and dispatch semantics.

## Evidence
User intent: use Symphony dispatch, but avoid guessing because the task may contain secrets. Candidate targets are team chat or private worker chat.

## Open Questions
Which Chat should receive the task? Should the task be redacted before dispatch? Which worker is authorized to see the secret-bearing context?

## Next Step
wait for explicit target and authority clarification before creating a Delivery, Session, or worker prompt.

## Related Docs
- `docs/symphony-system-evolution-control-plane.md`
- `docs/secretary/auto-symphony-contract.md`
- `docs/approval-grant-design.md`

## Acceptance Summary
Accepted as an ask-state control record with dispatch blocked until target and authority are clear.
