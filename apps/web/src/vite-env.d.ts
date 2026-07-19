/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly VITE_LINX_ENABLE_CHATKIT_COMPONENT?: string
  readonly VITE_LINX_PLATFORM_DEFAULT_MODEL?: string
  readonly VITE_LINX_DISABLE_DEV_LOCAL?: string
  readonly VITE_LINX_LOCAL_XPOD_URL?: string
  readonly VITE_SOLID_IDP_ISSUERS?: string
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __LINX_APP_VERSION__: string
declare const __LINX_RELEASE_REPO__: string
