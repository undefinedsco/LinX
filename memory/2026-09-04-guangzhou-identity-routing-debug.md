# Guangzhou identity routing debug

## Symptom

Opening the Guangzhou LinX Web deployment could send the login flow to `id.undefineds.co` instead of the Guangzhou Xpod identity service.

## Root cause

`apps/web/src/modules/login/constants.ts` used the public cloud identity URL as its unconditional fallback when `VITE_CLOUD_IDENTITY_URL` was not injected into the static build. The local-cloud onboarding and controller fallbacks also referenced the shared public-cloud constant directly. Because the Web app is a static bundle, the Guangzhou deployment had no runtime environment substitution and therefore selected the public identity origin.

## Fix

- Added a host-aware default resolver in `apps/web/src/modules/login/constants.ts`.
- `undefineds-gz.sealosgzg.site` now resolves to `https://undefineds-gz-id.sealosgzg.site`.
- Other hosts retain `https://id.undefineds.co` as the fallback.
- An explicit `VITE_CLOUD_IDENTITY_URL` still has priority.
- Local onboarding and controller fallbacks now use the resolved app issuer.
- Added unit coverage for Guangzhou, non-Guangzhou, and case-insensitive host matching.

## Verification

- Login-related tests: 88/88 passed.
- Full Web tests: 2,900/2,900 passed.
- Web build check passed.
- `git diff --check` passed.
- Guangzhou Web, identity, OIDC discovery, and ChatKit health endpoints all returned HTTP 200.
- Guangzhou `homepage` and `xpod-cloud` pods are Running with zero restarts after the targeted Xpod restart.
- The deployed static bundle contains both the Guangzhou mapping and the public-cloud fallback; the latter remains intentional for non-Guangzhou deployments.
- A fresh browser visit to Guangzhou Web and click on “登录” navigated to `https://undefineds-gz-id.sealosgzg.site/.account/`, where the expected authorization screen was rendered.

## Deployment scope

Only the Guangzhou Web PVC content and Guangzhou `homepage`/`xpod-cloud` workloads were touched. Singapore resources were not modified.

## Operator note

An already-open browser tab may still show the old `id.undefineds.co` transaction. Start from `https://undefineds-gz.sealosgzg.site/chat` and reload so the new static bundle starts a fresh Guangzhou login flow. Local development should set `VITE_CLOUD_IDENTITY_URL=https://undefineds-gz-id.sealosgzg.site` when it needs to use Guangzhou explicitly.
