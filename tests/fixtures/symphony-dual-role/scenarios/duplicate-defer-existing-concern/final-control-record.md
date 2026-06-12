# Duplicate Saved Replies Follow-Up Control Record

## Status
Duplicate/deferred roadmap concern.

## Scope
Bind the Pod-backed saved replies follow-up to the existing saved replies control record. This replay must not create independent saved replies work and must not expand an active chat loading fix.

## Current Truth
Saved replies are already captured as a documentation-first roadmap candidate. Pod-backed storage is a decision path for that concern, not a new issue and not a dependency of chat list loading.

## Active Work
Link to the existing saved replies control record and append the Pod-backed storage preference there. Do not create a second saved replies issue. Do not start a worker run for saved replies. Do not merge saved replies into chat loading.

## Compatibility Impact
Compatible. No runtime behavior, model, storage, or command surface is authorized to change by this replay.

## Evidence
User intent: keep the Pod-backed saved replies idea, but avoid slowing the current chat loading fix. This is duplicate/defer input, not implementation authorization.

## Open Questions
When saved replies become active, should Pod-backed storage be required for all surfaces or only for cross-device sync? Which permissions and namespace should own saved reply records?

## Next Step
Update the existing saved replies control record with this follow-up, then wait until active chat loading work lands before reprioritizing.

## Related Docs
- `docs/symphony-system-evolution-control-plane.md`
- `docs/chat-module-alignment.md`
- `docs/secretary/README.md`

## Acceptance Summary
Accepted as a duplicate deferred concern linked to existing saved replies planning without changing active work.
