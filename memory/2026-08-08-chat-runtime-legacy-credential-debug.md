# Chat runtime legacy credential debug

## Symptoms

- Service Web refresh requested authorization again.
- Agent Home bootstrap produced two expected-but-noisy `412` writes.
- ChatKit reported that no AI API key was configured even though the local Pod credential document contained one.
- ChatKit retry removed the old answer without starting a replacement.

## Root causes

1. Service mode deleted the Inrupt loopback session on every normal page load, and restore ignored secure session metadata.
2. Existing Agent Homes were seeded with conditional PUTs instead of checking seed resources first.
3. Legacy credentials predated `authMode`; the shared schema made that predicate mandatory in SPARQL, filtering legacy rows from both exact and collection reads.
4. `threads.retry_after_item` may identify the user item itself, but retry searched only before the target item.

## Fixes

- Preserve service-mode loopback auth and merge secure Inrupt session metadata.
- HEAD existing Agent Home seed files and skip existing writes.
- Keep the `authMode=apiKey` write default while making the field optional on reads; scope AI configuration SPARQL endpoints to the current account.
- Fall back from partial exact credential reads to the scoped collection and support both retry item semantics.
- Treat an empty custom-provider stream as a generation failure instead of a successful blank answer.

## Verification

- Web build passed.
- Auth/runtime/credential/retry focused tests passed (models 7/7; ChatKit 27/27; auth suite 87/87 earlier in the same investigation).
- Browser refresh restored directly to authenticated Chat.
- Local xpod logs showed HEAD-only Agent Home probing and no 412 writes.
- Browser traffic showed the account-scoped `/cuilinsu/settings/-/sparql` credential query.
- Legacy credential no longer produced the missing-key routing branch; the selected custom model itself returned an empty stream, now surfaced as a generation failure.
- Local `linx-lite` web search reached xpod but returned a capability error because the configured upstream does not support Responses API web search.

## Remaining external constraints

- Configure an xpod upstream that supports Responses API web search before citation QA can pass with real sources.
- ChatKit's localhost domain-verification warning is emitted inside the CDN iframe; the installed public configuration types expose no supported disable switch.
