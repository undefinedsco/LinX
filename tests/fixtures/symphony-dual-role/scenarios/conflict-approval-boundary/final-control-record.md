# Approval Boundary Conflict Control Record

## Status
Product-semantics conflict; blocked on approval/grant design.

## Scope
Capture the user's automation goal without weakening safety boundaries. The request touches backend approvals, destructive operations, external network access, and Secretary auto behavior.

## Current Truth
`auto` controls input-loop ownership, not backend approval bypass. Backend approval and grant semantics remain part of the unified approval pipeline. Destructive operations and external network requests still require explicit authority unless a valid grant policy matches them.

## Active Work
Do not dispatch a worker to bypass approval. The only active work allowed by this replay is to update the approval/grant design record with the automation goal, authority boundaries, audit needs, and unresolved questions.

## Compatibility Impact
migration_required. Broadening auto approval would change safety semantics and must define affected operations, grant scopes, audit records, revocation, rollback, and user-visible migration before implementation.

## Evidence
User intent: reduce interruption from approval prompts, including deletes and external calls, while preserving safety. This creates a conflict with existing approval semantics rather than a ready implementation task.

## Open Questions
Which operation classes may be granted for a session? Which must always wait for explicit user approval? How are grants matched, audited, revoked, and surfaced in CLI and web approval UIs?

## Next Step
Update `docs/approval-grant-design.md` and the auto/Symphony contract before any runtime changes. Ask for explicit authority if a proposed change would allow destructive or external operations without a prompt.

## Related Docs
- `docs/approval-grant-design.md`
- `docs/secretary/auto-symphony-contract.md`
- `docs/symphony-system-evolution-control-plane.md`

## Acceptance Summary
Accepted as a conflict record that preserves the automation goal while blocking approval bypass implementation.
