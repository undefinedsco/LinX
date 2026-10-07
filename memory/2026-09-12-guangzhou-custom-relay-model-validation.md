# Guangzhou custom relay model validation

## DEBUG REPORT

- **Symptom:** Adding/verifying models from the Guangzhou OpenAI provider showed
  “模型服务暂时不可用” when a third-party OpenAI-compatible relay URL was used.
- **Root cause:** LinX allowed a third-party Base URL to be entered under the
  built-in OpenAI provider. Xpod correctly restricts built-in provider
  credentials to trusted provider endpoints; arbitrary public compatible APIs
  must use the `custom` provider. LinX mapped Xpod's safety rejection to a
  generic service-unavailable message. A root compatible URL also omitted the
  conventional `/v1` API path.
- **Fix:** LinX now rejects third-party URLs under built-in OpenAI before saving
  a key and directs the user to “自定义兼容服务”. Root URLs entered for the
  custom provider are normalized to `/v1`; explicit API paths are preserved.
- **Evidence:** The supplied credential reached both relay model endpoints with
  HTTP 200 from the workstation and `https://timicc.com/v1/models` returned 16
  models from the Guangzhou Xpod container. Model-service tests passed 56/56;
  the production build passed; the deployed bundle contains the new guidance;
  all 9 static deployment assets passed the live verifier.
- **Regression test:**
  `apps/web/src/modules/model-services/features/detail/useModelServicesContentPaneController.test.tsx`
- **Related:** This preserves Xpod's SSRF/provider allowlist boundary. The key is
  stored by Xpod and was not written to source code or this report.
- **Status:** DONE_WITH_CONCERNS — deployment is complete; final authenticated
  custom-provider click verification is pending because the Mac locked during
  the browser run.
