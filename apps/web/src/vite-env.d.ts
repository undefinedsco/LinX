/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLID_IDP_ISSUERS?: string
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}