# Guangzhou Xpod test-resource audit

## Finding

The historical verification set is mixed; it was not uniformly tied to one default identity or one Xpod instance.

## Resource mapping

- Unit/Vitest tests are process-local and use mocks or test doubles. They do not prove a production-region identity or Xpod route.
- `tests/e2e/specs/chat-alignment.spec.ts` and `tests/e2e/specs/real-seeded-auth.spec.ts` start a temporary seeded Xpod runtime on a random localhost port. These are real Xpod protocol tests, but not Guangzhou deployment tests.
- `tests/e2e/specs/real-cloud-auth.spec.ts` and the Cloud-managed Local suite intentionally use the public cloud identity (`id.undefineds.co`) for the official Cloud contract. They are not Guangzhou-region tests.
- The latest public Chat QA targeted `https://undefineds-gz.sealosgzg.site/chat`; the Guangzhou Web, identity and API routes were checked, and the browser login button was freshly verified to navigate to `https://undefineds-gz-id.sealosgzg.site/.account/`.

## Consequence

The latest Guangzhou browser pass is valid for the deployed Guangzhou path, but the older local/official-cloud suites must not be described as Guangzhou acceptance evidence. A complete Guangzhou acceptance run must be launched with an explicit Guangzhou base URL and a real authenticated Guangzhou Xpod account, then record the issuer and runtime API host in its report.

## Current route evidence

The Guangzhou ingress maps the region's Web, API, identity and Pod hosts through the Guangzhou gateway. The deployed bundle resolves the Guangzhou Web host to the Guangzhou identity host. Health checks for Web, identity discovery, and ChatKit API all return HTTP 200; homepage and xpod-cloud are Running with zero restarts.
