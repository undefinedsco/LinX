# DEBUG REPORT: ChatKit local bootstrap and model picker fallback

Date: 2026-09-10
Status: DONE_WITH_CONCERNS (Guangzhou browser recheck pending desktop unlock)

## Symptom

- The local `127.0.0.1:5174/chat` page could show a CDN connection termination page inside ChatKit and had no message composer.
- Guangzhou displayed `gpt-5.6-sol` in the header, while “模型设置” showed an empty model list.

## Root cause

1. The browser loaded ChatKit directly from the OpenAI CDN. Under the local HTTP host, the custom element could fail to register or the iframe could fail while loading its cross-origin code-split assets. The parent page consequently had no usable composer.
2. The model picker was derived only from the currently returned, enabled provider catalog. The persisted `provider/model` pair was not added back when the catalog was delayed, incomplete, or did not contain that exact pair.
3. Xpod had an old empty `openai-default` credential row. A provider-enable action could reactivate it, and the runtime then selected the row before the valid managed relay credential, producing “missing credential secret payload”.

## Fix

- Load ChatKit through `/chatkit-cdn/` on the app origin, and proxy ChatKit's `/assets/ck1/` and `/cdn-cgi/` paths in Vite and Nginx.
- Configure Nginx to retry transient CDN connection, timeout, and 502/503/504 failures up to three times.
- Always include the active persisted model as a selectable option when it is absent from the live catalog, without duplicating an existing option.
- Normalize an explicit provider/model selection before saving it back to the chat configuration.
- Treat Xpod's non-secret credential markers (`keyVersion` / `lastRefreshAt`) as proof of a managed credential, and never re-enable empty legacy rows.
- Persist an OpenAI-compatible provider's verified Base URL as provider metadata so the relay remains visible and consistent after refresh.

## Verification

- ChatHeader regression: 9/9 passed.
- Web `build:check`: passed.
- Nginx config syntax: passed.
- `git diff --check`: passed.
- Real local browser: ChatKit iframe loaded and the `输入消息...` composer was visible.
- Guangzhou browser before the final cleanup: ChatKit → Xpod → the configured OpenAI-compatible relay returned the exact probe response `TIMICC-RELAY-20260910`.
- Guangzhou r4 deployment: static entry hash matches the local build; homepage and xpod-cloud are 1/1 Ready; ChatKit health is `ok`.
- Guangzhou credential state after cleanup: valid managed OpenAI credential active; empty legacy `openai-default` and unsupported custom adapter inactive. A recovery backup is kept inside Xpod.
- The r4 browser recheck is still pending because the desktop became locked and browser automation could not read or click the page.

## Follow-up

After the desktop is unlocked, reload Guangzhou and verify the final user flow: model picker is populated, relay-backed send returns, the response survives refresh, and no queued failure remains. Do not mark full Chat E2E complete until this final browser flow is verified.
