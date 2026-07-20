/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLID_IDP_ISSUERS?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_TLDRAW_LICENSE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __LINX_APP_VERSION__: string
declare const __LINX_RELEASE_REPO__: string
