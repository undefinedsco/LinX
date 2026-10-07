# Debug Report: Guangzhou model validation reported as login failure

- Date: 2026-08-31
- Status: DONE_WITH_CONCERNS
- Environment: Guangzhou LinX Cloud

## Symptom

After saving an OpenAI-compatible provider with `https://timicc.com` as its Base URL, the model-services page displayed:

`登录页面暂时打不开。请检查网络，或回到“选择空间”重试。`

## Root cause

The login flow was healthy. The model-services verification path called the provider's `/models` endpoint directly from the browser. Because the request carries an `Authorization` header, the browser issued a CORS preflight request. `https://timicc.com/models` returned HTTP 403 to that preflight for the Guangzhou LinX origin.

The browser therefore raised `Failed to fetch` before sending the API key. The shared user-facing error formatter classifies generic `failed to fetch` errors as login-page failures, so the model connection failure was presented as an authentication problem.

## Evidence

- Dynamic OIDC registration returned 201.
- Authorization and token exchange completed successfully.
- The model-services page showed the Cloud space as connected.
- Provider and credential writes to the user's Pod returned 201/205, and subsequent reads returned 200.
- The browser page showed the saved Base URL and provider state.
- An unauthenticated CORS preflight to `https://timicc.com/models`, with the Guangzhou LinX origin and `Authorization` requested, returned HTTP 403 from Cloudflare.
- No request reached the deployed AI Gateway during browser-side verification.

## Correct fix

Do not fetch third-party model APIs from the browser. The frontend should persist the provider/credential draft, then call Xpod's authenticated management endpoint:

`POST /api/ai/gateway/providers/:provider/models/refresh`

using the Solid session fetch. Xpod's existing `ProviderModelsService` reads the active credential from the Pod, opens the secret server-side, calls the provider's `/models` endpoint, and returns the normalized model list. The model-services UI should also map network failures in this flow to a model-service message rather than the login error formatter.

## Related

The required backend route and OpenAI-compatible adapter already exist in Xpod. The missing work is frontend integration and regression coverage; no new proxy protocol is needed.

## 2026-09-02 verification

- The supplied credential is valid. Authenticated `GET /v1/models` returned 11 models.
- `POST https://timicc.com/v1/chat/completions` returned a valid OpenAI-compatible JSON response.
- `POST https://timicc.com/chat/completions` returned the provider homepage HTML, so the configured Base URL must include `/v1`.
- The Guangzhou web bundle mounted in `linx-web-content` contains the old login error text but does not contain `models/refresh` or the new Xpod model-service network error text. The server-side gateway change exists only in the current uncommitted workspace diff and is not deployed.
- The current in-app browser session opened LinX's login dialog and redirected to the Xpod account login page, independently confirming that the active browser session is not currently authenticated.
- Targeted model-service tests passed: 3 files, 17 tests. Web TypeScript validation also passed.
