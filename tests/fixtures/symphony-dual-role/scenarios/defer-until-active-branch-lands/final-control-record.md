# Approval Digest Follow-Up Control Record

## Status
Deferred follow-up; wait for active branch completion.

## Scope
Capture the idea that Secretary may later summarize approval grants in a daily digest. This is related to approval grants but is not part of the active grant pipeline work.

## Current Truth
Approval-grant semantics are the active capability area. The digest request is useful future product behavior, but the user explicitly said not to interrupt the active approval-grant branch.

## Active Work
None for this replay. Do not interrupt the active approval-grant branch. Do not steer the current implementation. Do not start a digest worker now.

## Compatibility Impact
Compatible. No runtime behavior or approval semantics change until a later spec defines digest visibility, privacy, schedule, and storage.

## Evidence
User intent: preserve the digest idea, keep current approval-grant work focused, and review after the active branch lands.

## Open Questions
Should the digest be per session, per day, per workspace, or per Pod account? Which approvals and grants should be visible, and where should the digest be stored?

## Next Step
Link this deferred follow-up to the approval-grant capability and review after the active branch lands.

## Related Docs
- `docs/approval-grant-design.md`
- `docs/secretary/auto-symphony-contract.md`
- `docs/symphony-system-evolution-control-plane.md`

## Acceptance Summary
Accepted as deferred roadmap work that preserves the idea without changing active execution.
