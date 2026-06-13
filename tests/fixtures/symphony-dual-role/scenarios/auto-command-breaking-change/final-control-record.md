# Auto Command Breaking Change Control Record

## Status
Planned breaking/cleanup decision.

## Scope
Align the TUI control surface around `/auto on|off|status` and remove or reject old `/manual` semantics as a product mode.

## Current Truth
`/auto` is the single LinX auto switch. `manual` is not a product-level mode and should not be treated as an equivalent command surface.

## Active Work
Track as a compatibility-affecting contract update. Implementation work requires tests that reject stale `/manual` behavior and preserve `/auto` handling before backend fallback.

## Compatibility Impact
Breaking. Users or scripts relying on `/manual` must migrate to `/auto off`. No backend approval policy semantics should be changed by this cleanup.

## Evidence
User intent: breaking change around `/auto` and manual deprecation. Existing contract: `docs/secretary/auto-symphony-contract.md`.

## Open Questions
Should `/manual` show a migration message, hard error, or pass through as ordinary backend text during the deprecation window?

## Next Step
Update the contract and tests first, then implement command handling consistently.

## Related Docs
- `docs/secretary/auto-symphony-contract.md`
- `docs/approval-grant-design.md`

## Acceptance Summary
Accepted as a breaking command-surface change with explicit migration to `/auto off`.
