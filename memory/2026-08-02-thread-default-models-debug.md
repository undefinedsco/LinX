# Thread `__default__` / local models debug report

## Symptom

- The Electron Web UI at `http://127.0.0.1:5173/chat` fails to create a runtime session with `Thread __default__ was not found in the Pod`.
- Starting current Web source against the checked-out `packages/models` fails because required exports are missing.

## Root cause

- Port 5173 is served by an Electron process containing stale Web assets from the July `__default__` compatibility implementation. Current LinX source no longer selects the logical `__default__` value as a durable Thread row id.
- `packages/models` is an independent, ignored local checkout at detached commit `6cd449c` (`0.2.26`, 2026-05-17), while LinX declares `@undefineds.co/models@0.2.45`.
- The checkout contains six uncommitted files implementing newer AI-config APIs required by current LinX. Those changes do not apply cleanly to current models `origin/main` (`0f8a23d`, `0.2.47`).
- Therefore neither the clean old checkout nor clean current models main alone satisfies the current LinX source. This is configuration/source drift, not missing Pod login state.

## Evidence

- Browser login succeeds against local xpod.
- Runtime creation on the stale Electron build reports `Thread __default__ was not found in the Pod`.
- Current LinX source contains no `__default__` references; Git history locates them in July chat compatibility commits.
- Local models reports version `0.2.26`, detached HEAD, and six modified files.
- Clean models `origin/main` starts compilation but lacks `getDefaultAIConfigCredentialId`.
- The six-file local patch fails `git apply --check` against models `origin/main`.

## Required fix

1. Preserve the six uncommitted models changes.
2. Port them deliberately onto current models main, resolving schema/API conflicts and running models tests.
3. Publish/version the models result or explicitly wire LinX development to that clean checkout.
4. Rebuild/restart Electron from current LinX source.
5. Re-run real-xpod browser QA and confirm runtime creation uses a durable base-relative Thread row id.

## Status

BLOCKED pending authorization to migrate the dirty independent models checkout. No user changes were overwritten.
