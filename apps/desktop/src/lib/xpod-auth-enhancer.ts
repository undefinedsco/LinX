const XPOD_INDEX_PATH = '/.account/'
const XPOD_ACCOUNT_PATH = '/.account/account/'
const XPOD_CREATE_POD_PATH = '/.account/create-pod/'
const XPOD_CONSENT_PATH = '/.account/oidc/consent/'
const XPOD_PASSWORD_LOGIN_PATH = '/.account/login/password/'
const XPOD_PASSWORD_REGISTER_PATH = '/.account/login/password/register/'
const EMBEDDED_QUERY_KEY = 'embedded'
const EMBEDDED_QUERY_VALUE = '1'
const INSTALL_FLAG = '__LINX_XPOD_AUTH_ENHANCER__'
const NEW_DOCUMENT_SCRIPT_TIMEOUT_MS = 750

export interface ScriptInjectionTarget {
  getURL(): string
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>
}

export interface NewDocumentScriptInjectionTarget {
  debugger?: {
    isAttached(): boolean
    attach(protocolVersion?: string): void
    sendCommand(command: string, params?: Record<string, unknown>): Promise<unknown>
  }
}

const newDocumentScriptIdentifiers = new WeakMap<object, string>()

export function normalizeXpodPathname(pathname: string): string {
  if (!pathname) {
    return '/'
  }

  return pathname.endsWith('/') ? pathname : `${pathname}/`
}

export function isXpodIndexPageUrl(url: string): boolean {
  try {
    return normalizeXpodPathname(new URL(url).pathname) === XPOD_INDEX_PATH
  } catch {
    return false
  }
}

export function isXpodAccountPageUrl(url: string): boolean {
  try {
    return normalizeXpodPathname(new URL(url).pathname) === XPOD_ACCOUNT_PATH
  } catch {
    return false
  }
}

export function isXpodCreatePodPageUrl(url: string): boolean {
  try {
    return normalizeXpodPathname(new URL(url).pathname) === XPOD_CREATE_POD_PATH
  } catch {
    return false
  }
}

export function isXpodConsentPageUrl(url: string): boolean {
  try {
    return normalizeXpodPathname(new URL(url).pathname) === XPOD_CONSENT_PATH
  } catch {
    return false
  }
}

export function isXpodPasswordRegisterPageUrl(url: string): boolean {
  try {
    return normalizeXpodPathname(new URL(url).pathname) === XPOD_PASSWORD_REGISTER_PATH
  } catch {
    return false
  }
}

export function isXpodPasswordLoginPageUrl(url: string): boolean {
  try {
    return normalizeXpodPathname(new URL(url).pathname) === XPOD_PASSWORD_LOGIN_PATH
  } catch {
    return false
  }
}

export function isXpodAuthPageUrl(url: string): boolean {
  return (
    isXpodIndexPageUrl(url)
    || isXpodAccountPageUrl(url)
    || isXpodCreatePodPageUrl(url)
    || isXpodConsentPageUrl(url)
    || isXpodPasswordLoginPageUrl(url)
    || isXpodPasswordRegisterPageUrl(url)
  )
}

export function addEmbeddedAuthQuery(url: string): string {
  try {
    const parsed = new URL(url)
    if (!isXpodAuthPageUrl(parsed.toString())) {
      return url
    }

    if (!parsed.searchParams.has(EMBEDDED_QUERY_KEY)) {
      parsed.searchParams.set(EMBEDDED_QUERY_KEY, EMBEDDED_QUERY_VALUE)
    }

    return parsed.toString()
  } catch {
    return url
  }
}

export function buildXpodAuthEnhancerScript(): string {
  return [
    '(() => {',
    `  const INSTALL_FLAG = ${JSON.stringify(INSTALL_FLAG)};`,
    '  if (globalThis[INSTALL_FLAG]) {',
    "    return 'already-installed';",
    '  }',
    '  globalThis[INSTALL_FLAG] = true;',
    '  try {',
    '    const provisionCode = new URL(window.location.href).searchParams.get("provisionCode");',
    '    if (provisionCode) window.sessionStorage.setItem("provisionCode", provisionCode);',
    '  } catch {}',
    "  return 'installed';",
    '})();',
  ].join('\n')
}

export function buildXpodAuthEnhancerPreloadScript(provisionCode?: string | null): string {
  return [
    '(() => {',
    `  const providedProvisionCode = ${JSON.stringify(provisionCode ?? null)};`,
    '  try {',
    '    const urlProvisionCode = new URL(window.location.href).searchParams.get("provisionCode");',
    '    const nextProvisionCode = providedProvisionCode || urlProvisionCode;',
    '    if (nextProvisionCode) window.sessionStorage.setItem("provisionCode", nextProvisionCode);',
    '  } catch {}',
    '})();',
    buildXpodAuthEnhancerScript(),
  ].join('\n')
}

export async function installXpodAuthEnhancerOnNewDocument(
  target: NewDocumentScriptInjectionTarget,
  provisionCode?: string | null,
): Promise<boolean> {
  const pageDebugger = target.debugger
  if (!pageDebugger) {
    return false
  }

  if (!pageDebugger.isAttached()) {
    pageDebugger.attach('1.3')
  }

  await withTimeout(
    pageDebugger.sendCommand('Page.enable'),
    NEW_DOCUMENT_SCRIPT_TIMEOUT_MS,
  )

  const previousIdentifier = newDocumentScriptIdentifiers.get(target)
  if (previousIdentifier) {
    await withTimeout(
      pageDebugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: previousIdentifier,
      }),
      NEW_DOCUMENT_SCRIPT_TIMEOUT_MS,
    ).catch(() => undefined)
  }

  const result = await withTimeout(
    pageDebugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: buildXpodAuthEnhancerPreloadScript(provisionCode),
    }) as Promise<{ identifier?: string }>,
    NEW_DOCUMENT_SCRIPT_TIMEOUT_MS,
  )

  if (typeof result.identifier === 'string') {
    newDocumentScriptIdentifiers.set(target, result.identifier)
  }

  return true
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timed out installing xpod auth preload after ${timeoutMs}ms`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

export async function installXpodAuthEnhancer(target: ScriptInjectionTarget): Promise<boolean> {
  if (!isXpodAuthPageUrl(target.getURL())) {
    return false
  }

  await target.executeJavaScript(buildXpodAuthEnhancerScript(), true)
  return true
}
