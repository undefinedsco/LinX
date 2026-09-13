# Local custom model connection debug report

## Symptom

Verifying an OpenAI-compatible relay from the generic `custom` provider failed with a misleading account/space-name conflict message.

## Root cause

LinX sent `custom` through Xpod's legacy provider-connect endpoint. That endpoint only supports providers with a registered Connect adapter, and Xpod logged `No Connect adapter registered for custom`.

The Xpod-supported custom-provider flow uses the custom credential pool endpoint, then discovers models with the newly created credential's ID, offering, base URL, and OpenAI compatibility metadata.

## Fix

- Route custom API-key creation through `/api/ai/providers/custom/credentials/api-key`.
- Scope model discovery to the newly created custom credential.
- Remove the credential if discovery or local model persistence fails.
- Normalize a root OpenAI-compatible URL to its conventional `/v1` API path.
- Give a direct instruction when a third-party relay is entered under the built-in OpenAI provider.

## Verification

- Model-services tests: 59 passed across 11 files.
- Web typecheck and production build: passed.
- Live local browser flow: credential verified, 16 models loaded, no account-conflict error.
- Reload/OIDC re-entry: custom provider remained enabled, `/v1` base URL and all 16 models persisted.

Secrets were not recorded in this report.
