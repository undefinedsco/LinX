# Guangzhou static deployment white-screen debug

## Symptom

After the r4 frontend rollout, a fresh authenticated browser opened the Guangzhou
Chat route but rendered an empty root node. The page HTML loaded successfully.

## Root cause

The deployment copied the new `index.html` into the shared web PVC but did not
copy the matching `dist/assets` directory. The new HTML referenced
`/assets/index-BgkwbktG.js`, which returned HTTP 404, so React never mounted.

## Fix

- Uploaded the complete r4 `dist` output to the Guangzhou web PVC.
- Copied assets before atomically replacing `index.html`.
- Preserved the previous entry file in the release backup directory.
- Restarted the Guangzhou `homepage` rollout and verified readiness.

## Regression protection

Added `scripts/verify-web-static-deploy.mjs` and unit coverage. The verifier loads
the deployed page, resolves all same-origin `src` and `href` references, and
fails when an entry asset is missing or a JavaScript URL falls back to HTML.

## Fresh verification

- Unit regression: 3/3 passed.
- Guangzhou live verifier: 9/9 referenced assets reachable.
- Authenticated browser: ChatKit composer loaded.
- Model catalog loaded and `gpt-5.6-terra` selection survived a full reload.
- Existing user and assistant messages recovered after reload.
- Singapore was not accessed or modified.

## Remaining acceptance item

A new relay-backed message has not yet been sent in this post-fix browser run.
That action intentionally waits for the user's action-time confirmation because
it writes a real message into the Guangzhou account and invokes the relay.
