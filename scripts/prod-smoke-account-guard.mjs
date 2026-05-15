const DEFAULT_BLOCKED_WEBIDS = [
  'https://id.undefineds.co/ganbb/profile/card#me',
]

export const PROD_SMOKE_WEBID_ENV = 'LINX_PROD_SMOKE_WEBID'
export const LEGACY_PROD_SMOKE_WEBID_ENV = 'LINX_SMOKE_WEBID'

export function getExpectedProdSmokeWebId(env = process.env) {
  return normalizeWebId(env[PROD_SMOKE_WEBID_ENV] || env[LEGACY_PROD_SMOKE_WEBID_ENV] || '')
}

export function assertDedicatedProdSmokeAccount(actualWebId, options = {}) {
  const env = options.env || process.env
  const scriptName = options.scriptName || 'production Pod smoke script'
  const blockedWebIds = (options.blockedWebIds || DEFAULT_BLOCKED_WEBIDS).map(normalizeWebId)
  const actual = normalizeWebId(actualWebId)
  const expected = getExpectedProdSmokeWebId(env)

  if (!actual) {
    throw new Error(`${scriptName} could not determine the active WebID; refusing to run production Pod smoke.`)
  }

  if (!expected) {
    throw new Error(
      `${scriptName} writes to a production Pod. Set ${PROD_SMOKE_WEBID_ENV} to a dedicated smoke-test WebID `
      + `and run with that account's isolated LinX credentials. Refusing to use the default local account.`,
    )
  }

  if (actual !== expected) {
    throw new Error(
      `${scriptName} is logged in as ${actual}, but ${PROD_SMOKE_WEBID_ENV}=${expected}. `
      + 'Switch to the dedicated smoke account before running production Pod smoke.',
    )
  }

  if (blockedWebIds.includes(actual)) {
    throw new Error(
      `${scriptName} is using ${actual}, which is blocked for production smoke. `
      + 'Use a dedicated smoke-test account instead.',
    )
  }
}

function normalizeWebId(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}
