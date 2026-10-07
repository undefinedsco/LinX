import { expect, type Page } from '@playwright/test'

const SECRETARY_LABEL = 'LinX 主理人'

function isE2eDebugEnabled(): boolean {
  return process.env.LINX_E2E_DEBUG === '1' || process.env.LINX_E2E_DEBUG === 'true'
}

function debugLog(...args: unknown[]): void {
  if (isE2eDebugEnabled()) console.log(...args)
}

export async function expectSecretaryInitialized(page: Page, timeoutMs = 45_000): Promise<number> {
  await expectSecretaryVisible(page, timeoutMs)
  return expectSecretaryPersisted(page, timeoutMs)
}

export async function expectSecretaryVisible(page: Page, timeoutMs = 45_000): Promise<number> {
  const startedAt = Date.now()
  const deadline = Date.now() + timeoutMs
  let ui = await readSecretaryUiState(page)

  while (Date.now() < deadline && !ui.uiReady && !ui.failed) {
    await page.waitForTimeout(500)
    ui = await readSecretaryUiState(page)
  }

  if (!ui.uiReady) {
    throw new Error(`expected ${SECRETARY_LABEL} to become visible\n${JSON.stringify(ui, null, 2)}`)
  }

  await expect(page.getByText('默认助手准备失败')).toHaveCount(0)
  await expect(page.getByText('正在准备默认助手')).toHaveCount(0)
  await expect(page.getByText(SECRETARY_LABEL).first()).toBeVisible({ timeout: 10_000 })
  const elapsedMs = Date.now() - startedAt
  debugLog(`[secretary-bootstrap] visible in ${elapsedMs}ms`)
  return elapsedMs
}

export async function expectSecretaryPersisted(page: Page, timeoutMs = 45_000): Promise<number> {
  const startedAt = Date.now()
  const deadline = Date.now() + timeoutMs
  let state = await readSecretaryState(page)

  while (Date.now() < deadline && !state.filesReady && !state.ui.failed) {
    await page.waitForTimeout(500)
    state = await readSecretaryState(page)
  }

  if (!state.filesReady) {
    throw new Error(`expected ${SECRETARY_LABEL} to persist in Pod\n${JSON.stringify(state, null, 2)}`)
  }

  const elapsedMs = Date.now() - startedAt
  debugLog(`[secretary-bootstrap] persisted in ${elapsedMs}ms pod=${state.podUrl ?? 'unknown'}`)
  return elapsedMs
}

async function readSecretaryUiState(page: Page): Promise<SecretaryUiState> {
  return page.evaluate((secretaryLabel) => {
    const text = document.body.innerText
    const preparing = text.includes('正在准备默认助手')
    const failed = text.includes('默认助手准备失败')
    const hasSecretaryLabel = text.includes(secretaryLabel)
    return {
      uiReady: hasSecretaryLabel && !failed,
      preparing,
      failed,
      hasSecretaryLabel,
    }
  }, SECRETARY_LABEL)
}

async function readSecretaryState(page: Page): Promise<SecretaryState> {
  return page.evaluate(async (secretaryLabel) => {
    const db = (window as any).__SOLID_DB__
    const podUrl = normalizePodUrl(
      (window as any).__SOLID_DB_POD_URL__
        ?? db?.getDialect?.()?.getPodUrl?.()
        ?? db?.getPodUrl?.(),
    )
    const rawFetch = (
      db?.getDialect?.()?.getAuthenticatedFetch?.()
        ?? db?.getSession?.()?.fetch
        ?? db?.session?.fetch
    )
    const fetchFn = typeof rawFetch === 'function'
      ? rawFetch.bind(db?.session ?? db)
      : null
    const body = document.body.innerText
    const ui = readSecretaryUiState(body)

    if (!db || !podUrl || !fetchFn) {
      return {
        ok: false,
        uiReady: ui.hasSecretaryLabel && !ui.failed,
        filesReady: false,
        podUrl,
        ui,
        files: [],
        reason: 'Solid DB, Pod URL, or authenticated fetch is missing.',
      }
    }

    if (ui.preparing && !ui.failed) {
      return {
        ok: false,
        uiReady: true,
        filesReady: false,
        podUrl,
        ui,
        files: [],
        reason: `${secretaryLabel} is still preparing.`,
      }
    }

    const expectedFiles = [
      {
        path: '.data/contacts/__secretary__.ttl',
        includes: 'agents/__secretary__/',
      },
      {
        path: '.data/chat/__secretary__/index.ttl',
        includes: secretaryLabel,
      },
    ]

    const files = await Promise.all(expectedFiles.map(async (file) => {
      const url = new URL(file.path, podUrl).toString()
      try {
        const response = await fetchFn(url, {
          method: 'GET',
          headers: { Accept: '*/*' },
          signal: AbortSignal.timeout(8_000),
        })
        const text = await response.text().catch(() => '')
        return {
          path: file.path,
          url,
          status: response.status,
          ok: response.ok && text.includes(file.includes),
          hasExpectedBody: text.includes(file.includes),
          bodyPreview: text.slice(0, 240),
        }
      } catch (error) {
        return {
          path: file.path,
          url,
          status: 0,
          ok: false,
          hasExpectedBody: false,
          bodyPreview: error instanceof Error ? error.message : String(error),
        }
      }
    }))

    const filesReady = files.every((file) => file.ok)
    const uiReady = ui.hasSecretaryLabel && !ui.failed

    return {
      ok: uiReady && filesReady,
      uiReady,
      filesReady,
      podUrl,
      ui,
      files,
      reason: filesReady
        ? null
        : 'One or more Secretary contact/chat records are missing or have unexpected content.',
    }

    function normalizePodUrl(value: unknown): string | null {
      if (typeof value !== 'string' || !value.trim()) return null
      return value.endsWith('/') ? value : `${value}/`
    }

    function readSecretaryUiState(text: string) {
      return {
        preparing: text.includes('正在准备默认助手'),
        failed: text.includes('默认助手准备失败'),
        hasSecretaryLabel: text.includes(secretaryLabel),
      }
    }
  }, SECRETARY_LABEL)
}

interface SecretaryUiState {
  uiReady: boolean
  preparing: boolean
  failed: boolean
  hasSecretaryLabel: boolean
}

interface SecretaryState {
  ok: boolean
  uiReady: boolean
  filesReady: boolean
  podUrl: string | null
  ui: {
    preparing: boolean
    failed: boolean
    hasSecretaryLabel: boolean
  }
  files: Array<{
    path: string
    url: string
    status: number
    ok: boolean
    hasExpectedBody: boolean
    bodyPreview: string
  }>
  reason: string | null
}
