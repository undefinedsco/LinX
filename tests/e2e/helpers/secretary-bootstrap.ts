import { expect, type Page } from '@playwright/test'

export async function expectSecretaryInitialized(page: Page, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let state = await readSecretaryState(page)

  while (Date.now() < deadline && !state.ok && !state.ui.failed) {
    await page.waitForTimeout(500)
    state = await readSecretaryState(page)
  }

  if (!state.ok) {
    throw new Error(`expected AI Secretary to initialize\n${JSON.stringify(state, null, 2)}`)
  }

  await expect(page.getByText('默认助手准备失败')).toHaveCount(0)
  await expect(page.getByText('正在准备默认助手')).toHaveCount(0)
  await expect(page.getByText('AI Secretary').first()).toBeVisible({ timeout: 10_000 })
}

async function readSecretaryState(page: Page): Promise<SecretaryState> {
  return page.evaluate(async () => {
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
        podUrl,
        ui,
        files: [],
        reason: 'Solid DB, Pod URL, or authenticated fetch is missing.',
      }
    }

    if (ui.preparing && !ui.failed) {
      return {
        ok: false,
        podUrl,
        ui,
        files: [],
        reason: 'AI Secretary is still preparing.',
      }
    }

    const expectedFiles = [
      {
        path: 'agents/__secretary__/profile/card',
        includes: 'AI Secretary',
      },
      {
        path: '.data/contacts/__secretary__.ttl',
        includes: 'agents/__secretary__/profile/card#me',
      },
      {
        path: '.data/chat/__secretary__/index.ttl',
        includes: 'AI Secretary',
      },
      {
        path: '.data/chat/__secretary__/welcome.ttl',
        includes: 'AI Secretary',
      },
    ]

    const files = await Promise.all(expectedFiles.map(async (file) => {
      const url = new URL(file.path, podUrl).toString()
      try {
        const response = await fetchFn(url, {
          method: 'GET',
          headers: { Accept: '*/*' },
          signal: AbortSignal.timeout(2_000),
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

    const recordsReady = files.every((file) => file.ok)

    return {
      ok: ui.hasSecretaryLabel && !ui.failed && !ui.preparing && recordsReady,
      podUrl,
      ui,
      files,
      reason: recordsReady
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
        hasSecretaryLabel: text.includes('AI Secretary'),
      }
    }
  })
}

interface SecretaryState {
  ok: boolean
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
