# Chat List Regression Control Record

## Status
Known-broken existing capability; investigation required.

## Scope
Bind the blank chat list report to the existing chat list loading capability. This is not a new feature, not a saved replies request, and not a general UI cleanup.

## Current Truth
Chat list loading is expected to work. The user observed it working yesterday and blank today, so Symphony should treat the capability as known-broken until reproduced or disproven. The collection query failure is a clue, not a confirmed root cause, and login/session state remains a dependency to verify.

## Active Work
Draft an investigation task only. Do not add a UI fallback, do not refactor the chat module, and do not dispatch implementation work until the blank chat list is reproduced and the failing layer is identified.

## Compatibility Impact
Behavior change. The intended fix should restore expected chat list behavior without changing the chat data contract or hiding backend/query failures from diagnostics.

## Evidence
User evidence: chat list was usable yesterday, is blank today, and logs appear to show a collection query failure. This evidence is directional and must not be treated as confirmed root cause.

## Open Questions
Is the session authenticated when the chat list is blank? Does the collection query fail before or after Pod collection bootstrap? Is the blank state reproducible with the same Pod and workspace?

## Next Step
reproduce the blank chat list, capture the failing query or session state, and update this control record before assigning any implementation work.

## Related Docs
- `docs/chat-module-alignment.md`
- `docs/cli-login-and-key-principles.md`
- `docs/symphony-system-evolution-control-plane.md`

## Acceptance Summary
Accepted as a regression investigation record with known-broken system state and evidence preserved without premature implementation.
