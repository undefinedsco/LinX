# Custom model credential and routing investigation

## Symptoms

- Text-only chat was incorrectly blocked by image capability checks.
- A permanent credential failure was queued as if it were a transient network failure.
- Chat displayed a persistent queued-message banner.
- The local custom provider could not answer a text-only prompt.

## Root causes

1. Provider metadata/model saves could create an active default credential without secret material.
2. Xpod selected that empty credential and returned `missing encrypted secret payload`.
3. The chat retry classifier treated generic runtime 500 responses as transient.
4. Existing local data also contained stale credential endpoint metadata and malformed duplicated provider paths in custom model relations.
5. After credential cleanup, the malformed relation reached Xpod as an unknown explicit provider route.

## Fixes applied in LinX

- Provider-only saves no longer create empty credentials.
- Existing managed credentials remain selected and provider endpoint changes are synchronized to them.
- Legacy empty sibling credentials are reconciled without blocking page startup.
- Permanent credential failures are not queued; stale queued entries are removed on replay.
- The queued-message banner is hidden while online.
- Text-only turns do not require image capability; unsupported current image attachments are rejected at attachment/send time.
- Provider endpoint configuration is authoritative over stale credential-local endpoint metadata.

## Verification

- Focused web tests: 131 passed.
- Model config tests: 29 passed before the endpoint-alignment follow-up; rerun required after final edit.
- Web production typecheck/build passed.
- Live browser confirmed the queued-message banner is gone and the empty credential error is gone.
- Live request currently reaches the next legacy-data issue: `Unknown provider in explicit model route`. The running Xpod query index still contains the old malformed custom model relation and requires an indexed data migration or Xpod-side tolerant routing fix before end-to-end chat can pass.
