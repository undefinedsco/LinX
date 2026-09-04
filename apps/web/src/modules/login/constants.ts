const DEFAULT_CLOUD_IDENTITY_URL = 'https://id.undefineds.co'
const GUANGZHOU_WEB_HOST = 'undefineds-gz.sealosgzg.site'
const GUANGZHOU_CLOUD_IDENTITY_URL = 'https://undefineds-gz-id.sealosgzg.site'

/**
 * Resolve the account authority for the current Web deployment.
 *
 * The Web app is shipped as a static bundle, so a deployment that does not
 * inject VITE_CLOUD_IDENTITY_URL needs a safe, deployment-local default. Keep
 * the public LinX cloud as the general fallback, but bind the Guangzhou Web
 * host to its Guangzhou identity service so an account never crosses regions.
 */
export function resolveDefaultCloudIdentityUrl(hostname?: string): string {
  const currentHostname = hostname
    ?? (typeof window !== 'undefined' ? window.location.hostname : '')

  return currentHostname.toLowerCase() === GUANGZHOU_WEB_HOST
    ? GUANGZHOU_CLOUD_IDENTITY_URL
    : DEFAULT_CLOUD_IDENTITY_URL
}

export const LINQ_OFFICIAL_ISSUER = (
  import.meta.env.VITE_CLOUD_IDENTITY_URL ?? resolveDefaultCloudIdentityUrl()
).replace(/\/$/, '')
export const LOCAL_DEV_ISSUER = import.meta.env.VITE_SOLID_DEV_ISSUER ?? 'http://localhost:5737'

export const ISSUER_STORAGE_KEY = 'linx-solid-issuers'
// Using a fixed session key for this app instance
export const SESSION_STORAGE_KEY = 'solidClientAuthenticationUser:linx-session'
export const SESSION_SKIP_RESTORE_KEY = 'linx-solid-skip-restore'

export const MODAL_DIMENSIONS = { width: 280, height: 380 }
