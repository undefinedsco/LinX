import { expect, test, type Locator, type Page } from '@playwright/test'
import { loginToSeededXpod, readSeededAuthDebugState } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

async function selectContextMenuItem(page: Page, row: Locator, name: string) {
  const item = page.getByRole('menuitem', { name })
  await expect(async () => {
    await page.keyboard.press('Escape')
    await row.scrollIntoViewIfNeeded()
    await expect(row).toBeVisible({ timeout: 1_000 })
    await row.click({ button: 'right' })
    await expect(item).toBeVisible({ timeout: 1_000 })
    await item.click({ force: true, timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function vocabStringTriplePattern(predicate: string, value: string) {
  return new RegExp(`(?:udfs:${predicate}|<https://undefineds\\.co/vocab/${predicate}>)\\s+"${escapeRegExp(value)}"`)
}

async function invalidateInboxQueries(page: Page) {
  await page.evaluate(async () => {
    const { queryClient } = await import('/src/providers/query-provider.tsx')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inbox'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'audit'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'inputRequests'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'items'] }),
    ])
  })
}

async function openInboxFromBell(page: Page) {
  await page.getByRole('button', { name: '收件箱快捷入口' }).click()
  const openInboxAction = page.getByRole('button', { name: /处理待办|打开收件箱/ })
  await expect(openInboxAction).toBeVisible({ timeout: 10_000 })
  await openInboxAction.click()
  await expect(page.locator('[data-micro-app-id="inbox"]')).toBeVisible({ timeout: 10_000 })
}

function inboxApprovalButtonForTarget(page: Page, target: string) {
  return page.getByRole('button', { name: new RegExp(escapeRegExp(target)) })
}

async function readStructuredCellProposalFromCollection(
  page: Page,
  input: {
    resourceUri: string
    subject: string
    includes: string[]
    proposalContainerUri?: string
  },
) {
  return page.evaluate(async ({ resourceUri, subject, includes, proposalContainerUri }) => {
    const db = (window as any).__SOLID_DB__
    const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
    if (!authFetch) {
      throw new Error('Solid DB authenticated fetch is not ready.')
    }
    const { structuredCellProposalCollection } = await import('/src/modules/files/collections.ts')
    const readText = async (uri: string) => {
      const response = await authFetch(uri, { cache: 'no-store' })
      return {
        status: response.status,
        text: await response.text(),
      }
    }
    const [resource, proposals, proposalContainer] = await Promise.all([
      readText(resourceUri),
      structuredCellProposalCollection.fetchByDocument(resourceUri, db),
      proposalContainerUri ? readText(proposalContainerUri) : Promise.resolve({ status: 0, text: '' }),
    ])
    const proposal = proposals.find((candidate: {
      id: string
      proposalResourceUri: string
      subject: string
      predicate: string
      nextValues: string[]
      previousValues: string[]
      documentUri: string
    }) => (
      candidate.documentUri === resourceUri
      && candidate.subject === subject
      && includes.every((value) => (
        candidate.id.includes(value)
        || candidate.proposalResourceUri.includes(value)
        || candidate.predicate.includes(value)
        || candidate.previousValues.some((entry) => entry.includes(value))
        || candidate.nextValues.some((entry) => entry.includes(value))
      ))
    ))
    const proposalResource = proposal
      ? await readText(proposal.proposalResourceUri)
      : { status: 0, text: '' }

    return {
      found: !!proposal,
      resourceStatus: resource.status,
      resourceText: resource.text,
      proposalContainerStatus: proposalContainer.status,
      proposalContainerText: proposalContainer.text,
      proposalUri: proposal?.proposalResourceUri ?? null,
      proposalTarget: proposal?.id ?? null,
      proposalStatus: proposalResource.status,
      proposalText: proposalResource.text,
      proposal,
      candidateSummary: proposals.map((candidate: {
        id: string
        proposalResourceUri: string
        subject: string
        predicate: string
        nextValues: string[]
      }) => `${candidate.id} ${candidate.proposalResourceUri} ${candidate.subject} ${candidate.predicate} ${candidate.nextValues.join(', ')}`).join('\n---\n'),
    }
  }, input)
}

test.describe.configure({ mode: 'serial' })

test.describe('Files real Pod smoke', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('lists and opens a markdown resource written through authenticated fetch', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')

      const fetchWithStage = async (
        stage: string,
        uri: string,
        init?: RequestInit,
      ): Promise<Response> => {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 15_000)

        try {
          return await authFetch(uri, {
            ...init,
            signal: controller.signal,
          })
        } catch (error) {
          const reason = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error)
          const probes = await Promise.all([
            probeFetch('raw OPTIONS', uri, {
              method: 'OPTIONS',
            }),
            probeFetch('raw GET', uri, {
              method: 'GET',
              headers: { Accept: '*/*' },
            }),
            probeFetch('auth HEAD', uri, {
              method: 'HEAD',
            }),
            probeFetch('auth GET', uri, {
              method: 'GET',
              headers: { Accept: '*/*' },
            }),
          ])
          throw new Error(JSON.stringify({
            message: `files smoke seed failed during ${stage}`,
            stage,
            uri,
            method: init?.method ?? 'GET',
            reason,
            probes,
            dbStatus: (window as any).__SOLID_DB_STATUS__ ?? null,
            podUrl,
          }, null, 2))
        } finally {
          window.clearTimeout(timeout)
        }
      }

      const probeFetch = async (label: string, uri: string, init: RequestInit) => {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 5_000)
        const fetcher = label.startsWith('raw ') ? window.fetch.bind(window) : authFetch
        try {
          const response = await fetcher(uri, {
            ...init,
            signal: controller.signal,
          })
          return {
            label,
            ok: response.ok,
            status: response.status,
            type: response.type,
            contentType: response.headers.get('content-type'),
            allow: response.headers.get('allow'),
          }
        } catch (error) {
          return {
            label,
            ok: false,
            status: 0,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          }
        } finally {
          window.clearTimeout(timeout)
        }
      }

      const resourceUri = new URL(`linx-files-smoke-${Date.now()}.md`, podUrl).href
      const metaUri = filesAppMetaResourceUri(resourceUri, { currentPodRootUri: podUrl })
      const content = '# LinX Files Smoke\n\nreal pod e2e'
      const response = await fetchWithStage('write markdown resource', resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: content,
      })
      if (!response.ok) {
        throw new Error(`failed to write smoke resource: ${response.status} ${await response.text()}`)
      }

      const metaContent = [
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '',
        `  <${resourceUri}>`,
        '    dcterms:source <https://source.example/ordinary-meta-smoke> ;',
        `  rdfs:seeAlso <${resourceUri}> ;`,
        `  udfs:vocab <${new URL('.vocab/terms.ttl', podUrl).href}> ;`,
        `  udfs:shape <${new URL('.vocab/shapes.ttl#MarkdownFileShape', podUrl).href}> .`,
      ].join('\n')
      const metaResponse = await fetchWithStage('write app .meta resource', metaUri, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: filesMetaInsertDataPatch(metaUri, metaContent),
      })
      if (!metaResponse.ok) {
        throw new Error(`failed to write smoke meta resource: ${metaResponse.status} ${await metaResponse.text()}`)
      }

      const verify = await fetchWithStage('read markdown resource', resourceUri)
      if (!verify.ok) {
        throw new Error(`failed to read smoke resource: ${verify.status} ${await verify.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        metaUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        noteTitle: 'LinX Files Smoke',
        content: await verify.text(),
      }
    })

    expect(smoke.podUrl).toContain(`/${runtime.podName}/`)
    expect(smoke.content).toContain('real pod e2e')

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('文件列表')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByLabel('文件工作区')).toBeVisible()

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.fileName)
    const fileRow = page.getByRole('button', { name: smoke.fileName })
    await expect(fileRow).toBeVisible({ timeout: 30_000 })
    await fileRow.dblclick()

    const editorSheet = page.getByRole('dialog', { name: smoke.noteTitle })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await expect(editorSheet.getByTestId('rich-text-file-editor').getByRole('heading', {
      level: 1,
      name: 'LinX Files Smoke',
    })).toBeVisible()
    await expect(editorSheet.getByLabel('文件详情标题').getByText(smoke.fileName, { exact: true })).toBeVisible()
    await expect(editorSheet.getByText('real pod e2e')).toBeVisible()
    const metaTail = editorSheet.getByLabel('文件 meta')
    await expect(metaTail).toContainText('text/markdown')
    await expect(metaTail).toContainText(smoke.metaUri)
    await expect(metaTail).toContainText('RDF metadata')
    await expect(metaTail).toContainText('source')
    await expect(metaTail).toContainText('https://source.example/ordinary-meta-smoke')
    await expect(metaTail).toContainText('相关链接')
    await expect(metaTail).toContainText(smoke.resourceUri)
    await expect(metaTail).toContainText('词表 / Schema')
    await expect(metaTail).toContainText('terms.ttl')
    await expect(metaTail).toContainText('MarkdownFileShape')

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('stages editable markdown detail .meta predicate edits through approval before mutating .meta', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }
      for (const path of [
        'inbox/',
        '.data/',
        '.data/approvals/',
        '.data/audits/',
        '.data/proposals/',
        '.data/proposals/cell/',
      ]) {
        await ensureContainer(path)
      }

      const resourceUri = new URL(`linx-files-meta-proposal-${Date.now()}.md`, podUrl).href
      const metaUri = filesAppMetaResourceUri(resourceUri, { currentPodRootUri: podUrl })
      const content = '# Editable Meta Smoke\n\nbody stays canonical'
      const metaContent = [
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '',
        '<#meta> rdfs:label "Original meta title" ;',
        '  udfs:reviewStatus "Draft" ;',
        '  udfs:tags "docs", "smoke" ;',
        '  dcterms:source <https://source.example/editable-meta-smoke> .',
        '',
      ].join('\n')

      const resourceWrite = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: content,
      })
      if (!resourceWrite.ok) {
        throw new Error(`failed to write markdown resource: ${resourceWrite.status} ${await resourceWrite.text()}`)
      }
      const metaWrite = await authFetch(metaUri, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: filesMetaInsertDataPatch(metaUri, metaContent),
      })
      if (!metaWrite.ok) {
        throw new Error(`failed to write meta resource: ${metaWrite.status} ${await metaWrite.text()}`)
      }

      const [resourceVerify, metaVerify] = await Promise.all([
        authFetch(resourceUri),
        authFetch(metaUri),
      ])
      return {
        podUrl,
        resourceUri,
        metaUri,
        proposalContainerUri: new URL('.data/proposals/cell/', podUrl).href,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        content: await resourceVerify.text(),
        metaText: await metaVerify.text(),
      }
    })

    const metaWriteResponses: { method: string; status: number; body: string }[] = []
    page.on('response', async (response) => {
      if (response.url() !== smoke.metaUri) return
      const method = response.request().method()
      if (method !== 'PATCH' && method !== 'PUT') return
      metaWriteResponses.push({
        method,
        status: response.status(),
        body: await response.text().catch(() => ''),
      })
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await page.getByPlaceholder('搜索当前范围...').fill(smoke.fileName)
    const fileRow = page.getByRole('button', { name: smoke.fileName })
    await expect(fileRow).toBeVisible({ timeout: 30_000 })
    await fileRow.dblclick()

    const editorSheet = page.getByRole('dialog', { name: 'Editable Meta Smoke' })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await expect(editorSheet.getByTestId('rich-text-file-editor')).toBeVisible()
    const metaTail = editorSheet.getByLabel('文件 meta')
    await expect(metaTail).toContainText(smoke.metaUri)
    await expect(metaTail.getByLabel('File title meta predicate')).toHaveValue('Original meta title')
    await expect(metaTail.getByLabel('已选择值 docs')).toBeVisible()
    await expect(metaTail.getByLabel('已选择值 smoke')).toBeVisible()
    await expect(metaTail.getByRole('combobox', { name: 'File tags meta predicate' })).toHaveValue('')
    await expect(metaTail.getByLabel('File source meta predicate')).toHaveValue('https://source.example/editable-meta-smoke')

    await metaTail.getByLabel('File title meta predicate').fill('Edited meta title')
    await metaTail.getByLabel('File title meta predicate').blur()
    await expect(metaTail.getByLabel('待审核更改：File title meta predicate')).toHaveText('*', { timeout: 30_000 })

    const structuredProposalInput = {
      resourceUri: smoke.metaUri,
      subject: '#meta',
      includes: ['rdfs:label', 'Original meta title', 'Edited meta title'],
      proposalContainerUri: smoke.proposalContainerUri,
    }
    await expect.poll(async () => {
      const current = await readStructuredCellProposalFromCollection(page, structuredProposalInput)
      return {
        found: current.found,
        proposalStatus: current.proposalStatus,
        resourceStatus: current.resourceStatus,
      }
    }, { timeout: 30_000 }).toEqual({
      found: true,
      proposalStatus: 200,
      resourceStatus: 200,
    })

    const persisted = await page.evaluate(async ({ resourceUri, metaUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const readText = async (uri: string) => {
        const response = await authFetch(uri)
        return {
          status: response.status,
          text: await response.text(),
        }
      }
      const [resource, meta] = await Promise.all([
        readText(resourceUri),
        readText(metaUri),
      ])
      return {
        resourceStatus: resource.status,
        resourceText: resource.text,
        metaStatus: meta.status,
        metaText: meta.text,
      }
    }, smoke)
    const proposalPersisted = await readStructuredCellProposalFromCollection(page, structuredProposalInput)
    if (!proposalPersisted.found || !proposalPersisted.proposalUri) {
      throw new Error(`editable file meta proposal not found through Files proposal collection.\nContainer diagnostic:\n${proposalPersisted.proposalContainerText}\nCandidates:\n${proposalPersisted.candidateSummary}`)
    }

    expect(metaWriteResponses).toEqual([])
    expect(persisted.resourceStatus).toBe(200)
    expect(persisted.resourceText).toBe(smoke.content)
    expect(persisted.resourceText).not.toContain('Edited meta title')
    expect(persisted.metaStatus).toBe(200)
    expect(persisted.metaText).toBe(smoke.metaText)
    expect(persisted.metaText).not.toContain('Edited meta title')
    expect(proposalPersisted.proposalContainerStatus).toBe(200)
    expect(proposalPersisted.proposalStatus).toBe(200)
    expect(proposalPersisted.proposalText).toMatch(/(?:udfs:StructuredCellChangeProposal|<https:\/\/undefineds\.co\/vocab\/StructuredCellChangeProposal>)/)
    expect(proposalPersisted.proposalText).toMatch(new RegExp(`(?:udfs:sourceDocument|<https://undefineds\\.co/vocab/sourceDocument>)\\s+<${smoke.metaUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>`))
    expect(proposalPersisted.proposalText).toMatch(/(?:udfs:subject|<https:\/\/undefineds\.co\/vocab\/subject>)\s+"#meta"/)
    expect(proposalPersisted.proposalText).toMatch(/(?:udfs:predicate|<https:\/\/undefineds\.co\/vocab\/predicate>)\s+"rdfs:label"/)
    expect(proposalPersisted.proposalText).toContain('Original meta title')
    expect(proposalPersisted.proposalText).toContain('Edited meta title')
    expect(proposalPersisted.proposalText).toMatch(/(?:udfs:writesCanonicalResource|<https:\/\/undefineds\.co\/vocab\/writesCanonicalResource>)\s+false/)

    await editorSheet.getByRole('button', { name: 'Close' }).click()
    await expect(editorSheet).toBeHidden({ timeout: 10_000 })
    await openInboxFromBell(page)
    const proposalTarget = inboxApprovalButtonForTarget(page, `${proposalPersisted.proposalUri}#proposal`)
    await expect(proposalTarget).toBeVisible({ timeout: 30_000 })
    await proposalTarget.click()
    await expect(page.getByRole('button', { name: '批准' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '批准' }).click()

    await expect.poll(() =>
      page.evaluate(async ({ resourceUri, metaUri, proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { resourceText: '', metaText: '', proposalText: '' }
        const [resourceResponse, metaResponse, proposalResponse] = await Promise.all([
          authFetch(resourceUri),
          authFetch(metaUri),
          authFetch(proposalUri),
        ])
        return {
          resourceText: resourceResponse.ok ? await resourceResponse.text() : '',
          metaText: metaResponse.ok ? await metaResponse.text() : '',
          proposalText: proposalResponse.ok ? await proposalResponse.text() : '',
        }
      }, { resourceUri: smoke.resourceUri, metaUri: smoke.metaUri, proposalUri: proposalPersisted.proposalUri }),
    { timeout: 30_000 }).toMatchObject({
      resourceText: smoke.content,
      metaText: expect.stringContaining('Edited meta title'),
      proposalText: expect.stringMatching(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/),
    })

    const approved = await page.evaluate(async ({ resourceUri, metaUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [resourceResponse, metaResponse] = await Promise.all([
        authFetch(resourceUri),
        authFetch(metaUri),
      ])
      return {
        resourceText: await resourceResponse.text(),
        metaText: await metaResponse.text(),
      }
    }, { resourceUri: smoke.resourceUri, metaUri: smoke.metaUri })
    expect(approved.resourceText).toBe(smoke.content)
    expect(approved.metaText).toContain('Edited meta title')
    expect(approved.metaText).not.toContain('Original meta title')
  })

  test('shows only structured chat file and runtime artifact records in Chat Files', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      const writeResource = async (resourceUri: string, content: string, contentType = 'text/markdown') => {
        const response = await authFetch(resourceUri, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: content,
        })
        if (!response.ok) {
          throw new Error(`failed to write ${resourceUri}: ${response.status} ${await response.text()}`)
        }
      }

      const stem = `linx-chat-files-boundary-${Date.now()}`
      const structuredFileName = `${stem}-structured.md`
      const runtimeArtifactName = `${stem}-runtime-artifact.md`
      const runtimeContainerName = `${stem}-runtime-container`
      const rootDecoyName = `${stem}-pod-root-decoy.md`
      const proseDecoyName = `${stem}-assistant-prose-decoy.md`
      const stdoutDecoyName = `${stem}-stdout-decoy.md`
      const toolNameDecoyName = `${stem}-tool-name-decoy.md`
      const localPathDecoyName = `${stem}-local-path-decoy.md`

      const structuredFileUri = new URL(structuredFileName, podUrl).href
      const runtimeContainerPath = `.data/workspaces/${stem}/`
      const runtimeContainerUri = new URL(runtimeContainerPath, podUrl).href
      const runtimeArtifactUri = new URL(runtimeArtifactName, runtimeContainerUri).href
      const rootDecoyUri = new URL(rootDecoyName, podUrl).href

      await ensureContainer('.data/')
      await ensureContainer('.data/workspaces/')
      await ensureContainer(runtimeContainerPath)
      await Promise.all([
        writeResource(structuredFileUri, '# Structured Chat File\n\nfrom richContent file block'),
        writeResource(runtimeArtifactUri, '# Runtime Artifact\n\nfrom explicit artifact record'),
        writeResource(rootDecoyUri, '# Root Decoy\n\nreal Pod resource but not referenced by chat structure'),
      ])

      const { chatOps } = await import('/src/modules/chat/collections.ts')
      const { useChatStore } = await import('/src/modules/chat/store.ts')
      const { useFilesStore } = await import('/src/modules/files/store.ts')

      const chatId = `chat-files-boundary-${Date.now()}`
      const threadId = `thread-${stem}`
      const chat = await chatOps.createAIChat({
        chatId,
        title: 'Chat Files Boundary Smoke',
        provider: 'undefineds',
        model: 'undefineds/linx-lite',
        systemPrompt: 'e2e chat files boundary smoke',
      })
      const thread = await chatOps.createThread(chat.id, 'Chat Files boundary thread', { threadId })
      const richContent = JSON.stringify({
        items: [
          {
            type: 'file',
            fileName: structuredFileName,
            fileUrl: structuredFileUri,
            fileSize: 52,
            mimeType: 'text/markdown',
          },
          {
            type: 'text',
            text: `Assistant prose mentions ${proseDecoyName} and /tmp/${localPathDecoyName}.`,
          },
          {
            type: 'tool',
            toolName: toolNameDecoyName,
            result: {
              stdout: `wrote ${stdoutDecoyName} in session logs`,
              stderr: `ignored local workspace path /workspace/${localPathDecoyName}`,
              artifacts: [
                {
                  type: 'artifact',
                  name: runtimeArtifactName,
                  resourceUri: runtimeArtifactUri,
                  contentType: 'text/markdown',
                  size: 48,
                },
              ],
            },
          },
        ],
        artifacts: [
          {
            type: 'artifact',
            name: runtimeContainerName,
            resourceUri: runtimeContainerUri,
          },
        ],
      })
      await chatOps.createAssistantMessage(
        chat.id,
        thread.id,
        [
          `Structured file: ${structuredFileName}`,
          `Decoy prose path: ${proseDecoyName}`,
          `Decoy stdout path: ${stdoutDecoyName}`,
          `Decoy local workspace path: /workspace/${localPathDecoyName}`,
        ].join('\n'),
        chat.agentId,
        richContent,
      )

      useChatStore.getState().selectChat(chat.id)
      useChatStore.getState().selectThread(thread.id)

      return {
        podUrl,
        chatId: chat.id,
        threadId: thread.id,
        structuredFileName,
        runtimeArtifactName,
        runtimeContainerName,
        rootDecoyName,
        proseDecoyName,
        stdoutDecoyName,
        toolNameDecoyName,
        localPathDecoyName,
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await page.evaluate(async ({ chatId, threadId }) => {
      const { useChatStore } = await import('/src/modules/chat/store.ts')
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useChatStore.getState().selectChat(chatId)
      useChatStore.getState().selectThread(threadId)
      useFilesStore.getState().openChatFilesScope()
    }, smoke)
    await expect(page.getByLabel('文件列表')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByLabel('文件工作区').getByText('聊天文件')).toBeVisible()

    const fileList = page.getByLabel('文件列表')
    await expect(fileList.getByRole('button', { name: smoke.structuredFileName })).toBeVisible({ timeout: 30_000 })
    await expect(fileList.getByRole('button', { name: smoke.runtimeArtifactName })).toBeVisible({ timeout: 30_000 })
    await expect(fileList.getByRole('button', { name: smoke.runtimeContainerName })).toBeVisible({ timeout: 30_000 })
    await expect(fileList).toContainText('text/markdown')

    await expect(fileList.getByRole('button', { name: smoke.proseDecoyName })).toHaveCount(0)
    await expect(fileList.getByRole('button', { name: smoke.stdoutDecoyName })).toHaveCount(0)
    await expect(fileList.getByRole('button', { name: smoke.toolNameDecoyName })).toHaveCount(0)
    await expect(fileList.getByRole('button', { name: smoke.localPathDecoyName })).toHaveCount(0)
    await expect(fileList.getByRole('button', { name: smoke.rootDecoyName })).toHaveCount(0)

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.rootDecoyName)
    await expect(fileList.getByText('没有匹配的资源')).toBeVisible({ timeout: 10_000 })
    await expect(fileList.getByRole('button', { name: smoke.rootDecoyName })).toHaveCount(0)
  })

  test('shows Agent homes, Workspace metadata, and Repository metadata from real Pod smart roots', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return uri

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        if (parentPath && parentPath !== normalizedPath) {
          await ensureContainer(parentPath)
        }
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath || './', podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
        return uri
      }

      const writeText = async (uri: string, content: string, contentType = 'text/turtle') => {
        const response = await authFetch(uri, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: content,
        })
        if (!response.ok) {
          throw new Error(`failed to write ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      const stem = `linx-files-smart-roots-${Date.now()}`
      const agentName = `secretary-${stem}`
      const workspaceName = `workspace-${stem}`
      const repositoryName = `repository-${stem}.ttl`

      await ensureContainer('.data/agents/')
      await ensureContainer(`.data/agents/${agentName}/`)
      await ensureContainer('.data/workspaces/')
      await ensureContainer(`.data/workspaces/${workspaceName}/`)
      await ensureContainer('.data/repositories/')

      const agentHomeUri = new URL(`.data/agents/${agentName}/`, podUrl).href
      const agentIndexUri = new URL('index.ttl', agentHomeUri).href
      const workspaceUri = new URL(`.data/workspaces/${workspaceName}/`, podUrl).href
      const workspaceReadmeUri = new URL('README.md', workspaceUri).href
      const workspaceMetaUri = filesAppMetaResourceUri(workspaceUri, { currentPodRootUri: podUrl })
      const repositoryUri = new URL(`.data/repositories/${repositoryName}`, podUrl).href

      await Promise.all([
        writeText(agentIndexUri, [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '<#home> a udfs:AgentHome ;',
          '  rdfs:label "Secretary Agent Home Smoke" ;',
          '  udfs:mode "active" .',
          '',
        ].join('\n')),
        writeText(workspaceReadmeUri, '# Workspace git snapshot smoke\n\nvisible from Files workspace root', 'text/markdown'),
        writeText(repositoryUri, [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '<#Repository> a udfs:Repository ;',
          '  rdfs:label "LinX Repository Smoke" ;',
          '  udfs:defaultBranch "main" .',
          '',
        ].join('\n')),
      ])

      const metaContent = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix git: <https://undefineds.co/vocab/git/> .',
        '',
        `  <${workspaceUri}>`,
        `    udfs:repository <${repositoryUri}> ;`,
        '    udfs:localPath "/Users/ganlu/develop/linx-files" ;',
        '    udfs:cwd "/Users/ganlu/develop/linx-files/apps/web" ;',
        '    git:branchName "files-module" ;',
        '    git:branchRef "refs/heads/files-module" ;',
        '    git:startCommit "abc123" ;',
        '    git:currentCommit "def456" ;',
        '    git:dirtyState "dirty" .',
      ].join('\n')
      const metaResponse = await authFetch(workspaceMetaUri, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: filesMetaInsertDataPatch(workspaceMetaUri, metaContent),
      })
      if (!metaResponse.ok) {
        throw new Error(`failed to write workspace meta: ${metaResponse.status} ${await metaResponse.text()}`)
      }

      return {
        podUrl,
        agentName,
        agentHomeUri,
        agentIndexUri,
        workspaceName,
        workspaceUri,
        workspaceMetaUri,
        workspaceReadmeName: 'README.md',
        repositoryName,
        repositoryUri,
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    const tree = page.getByRole('tree', { name: '文件分组树' })
    const fileList = page.getByLabel('文件列表')
    const workspace = page.getByLabel('文件工作区')
    const search = page.getByPlaceholder('搜索当前范围...')
    await expect(fileList).toBeVisible({ timeout: 30_000 })

    await tree.getByRole('treeitem', { name: /Agent homes/ }).click()
    await search.fill(smoke.agentName)
    const agentHomeRow = fileList.getByRole('button', { name: smoke.agentName })
    await expect(agentHomeRow).toBeVisible({ timeout: 30_000 })
    await agentHomeRow.click()
    await expect(workspace.getByText(smoke.agentName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(workspace.getByRole('button', { name: /index\.ttl/ })).toBeVisible()
    await expect(workspace.getByText('文件夹预览')).toBeVisible()
    await expect(workspace.getByText('包含')).toBeVisible()

    await tree.getByRole('treeitem', { name: /Workspaces/ }).click()
    await search.fill(smoke.workspaceName)
    const workspaceRow = fileList.getByRole('button', { name: smoke.workspaceName })
    await expect(workspaceRow).toBeVisible({ timeout: 30_000 })
    await workspaceRow.click()
    await expect(workspace.getByText(smoke.workspaceName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(workspace.getByRole('button', { name: /README\.md/ })).toBeVisible()
    await page.getByRole('button', { name: '查看 .meta' }).click()
    const drawer = page.getByLabel('Resource .meta inspector')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(smoke.workspaceMetaUri)
    await expect(drawer).toContainText('工作区摘要')
    await expect(drawer).toContainText('仓库')
    await expect(drawer).toContainText(smoke.repositoryUri)
    await expect(drawer).toContainText('本地路径')
    await expect(drawer).toContainText('/Users/ganlu/develop/linx-files')
    await expect(drawer).toContainText('分支')
    await expect(drawer).toContainText('files-module (refs/heads/files-module)')
    await expect(drawer).toContainText('变更状态')
    await expect(drawer).toContainText('dirty')
    await page.getByRole('button', { name: '关闭 .meta inspector' }).click()

    await tree.getByRole('treeitem', { name: /Repositories/ }).click()
    await search.fill(smoke.repositoryName)
    const repositoryRow = fileList.getByRole('button', { name: smoke.repositoryName })
    await expect(repositoryRow).toBeVisible({ timeout: 30_000 })
    await repositoryRow.click()
    await expect(workspace.getByText(smoke.repositoryName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible({ timeout: 30_000 })
    await expect(workspace.getByText('#Repository')).toBeVisible()
    await expect(workspace.getByText('"LinX Repository Smoke"')).toBeVisible()
    await expect(workspace.getByText('"main"')).toBeVisible()

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('favorites a real file from Files and restores it from the Favorites module', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      await ensureContainer('.data/')
      await ensureContainer('.data/favorites/')

      const resourceUri = new URL(`linx-files-favorite-${Date.now()}.md`, podUrl).href
      const content = '# Favorite Smoke\n\nfavorite real pod e2e'
      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: content,
      })
      if (!response.ok) {
        throw new Error(`failed to write favorite resource: ${response.status} ${await response.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        noteTitle: 'Favorite Smoke',
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.fileName)
    const fileRow = page.getByRole('button', { name: smoke.fileName })
    await expect(fileRow).toBeVisible({ timeout: 30_000 })
    await fileRow.dblclick()

    const editorSheet = page.getByRole('dialog', { name: smoke.noteTitle })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(editorSheet).toHaveCount(0)

    const workspace = page.getByLabel('文件工作区')
    await workspace.getByRole('button', { name: '收藏' }).click()

    await page.getByRole('navigation').getByRole('button', { name: '收藏', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="favorites"]')).toBeVisible({ timeout: 10_000 })
    await page.getByPlaceholder('搜索收藏').fill(smoke.fileName)
    await expect(page.getByText(smoke.fileName, { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByText(smoke.fileName, { exact: true }).click()
    await expect(page.getByRole('button', { name: '打开原对象' })).toBeVisible()

    await page.getByRole('button', { name: '打开原对象' }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('文件工作区').getByText(smoke.fileName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  })

  test('saves, renames, and deletes a markdown resource through the Files UI against a real Pod', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const stem = `linx-files-write-${Date.now()}`
      const resourceUri = new URL(`${stem}.md`, podUrl).href
      const renamedUri = new URL(`${stem}-renamed.md`, podUrl).href
      const initialContent = '# Write Smoke\n\nbefore save'
      const savedContent = '# Write Smoke\n\nafter save from Files UI'
      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: initialContent,
      })
      if (!response.ok) {
        throw new Error(`failed to write smoke resource: ${response.status} ${await response.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        renamedUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        renamedName: new URL(renamedUri).pathname.split('/').filter(Boolean).at(-1)!,
        noteTitle: 'Write Smoke',
        savedContent,
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.fileName)
    const fileRow = page.getByRole('button', { name: smoke.fileName })
    await expect(fileRow).toBeVisible({ timeout: 30_000 })
    await fileRow.dblclick()

    const editorSheet = page.getByRole('dialog', { name: smoke.noteTitle })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await editorSheet.getByRole('button', { name: '更多文件操作' }).click()
    await page.getByRole('menuitem', { name: '源码' }).click()
    await editorSheet.getByLabel('原始内容').fill(smoke.savedContent)
    await editorSheet.getByRole('button', { name: '保存原始内容' }).click()
    await expect(editorSheet.getByRole('button', { name: '保存原始内容' })).toBeDisabled()

    await expect.poll(async () => {
      return page.evaluate(async ({ resourceUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(resourceUri)
        return response.ok ? await response.text() : ''
      }, smoke)
    }, { timeout: 30_000 }).toBe(smoke.savedContent)

    await page.keyboard.press('Escape')
    await expect(editorSheet).toHaveCount(0)

    await selectContextMenuItem(page, page.getByRole('button', { name: smoke.fileName }), '重命名')
    const renameInput = page.getByLabel('新名称')
    await expect(renameInput).toBeVisible()
    await renameInput.fill(smoke.renamedName)
    await page.getByRole('button', { name: '重命名' }).click()
    await expect(renameInput).toBeHidden({ timeout: 10_000 })

    await expect.poll(async () => {
      return page.evaluate(async ({ resourceUri, renamedUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { oldStatus: 0, newStatus: 0, newText: '' }
        const [oldResponse, newResponse] = await Promise.all([
          authFetch(resourceUri),
          authFetch(renamedUri),
        ])
        return {
          oldStatus: oldResponse.status,
          newStatus: newResponse.status,
          newText: newResponse.ok ? await newResponse.text() : '',
        }
      }, smoke)
    }, { timeout: 30_000 }).toEqual({
      oldStatus: 404,
      newStatus: 200,
      newText: smoke.savedContent,
    })

    await page.evaluate(async ({ podUrl, renamedUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')
      const renamedMetaUri = filesAppMetaResourceUri(renamedUri, { currentPodRootUri: podUrl })
      const metaContent = [
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '',
        `  <${renamedUri}> rdfs:comment "delete should remove this sidecar" .`,
      ].join('\n')
      const response = await authFetch(renamedMetaUri, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: filesMetaInsertDataPatch(renamedMetaUri, metaContent),
      })
      if (!response.ok) {
        throw new Error(`failed to write renamed meta sidecar: ${response.status} ${await response.text()}`)
      }
    }, smoke)

    await expect.poll(async () => {
      return page.evaluate(async ({ podUrl, renamedUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return 0
        const { filesAppMetaResourceUri } = await import('/src/modules/files/files-rdf-contract.ts')
        const response = await authFetch(filesAppMetaResourceUri(renamedUri, { currentPodRootUri: podUrl }))
        return response.status
      }, smoke)
    }, { timeout: 30_000 }).toBe(200)

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.renamedName)
    const renamedRow = page.getByRole('button', { name: smoke.renamedName })
    await expect(renamedRow).toBeVisible({ timeout: 30_000 })
    await selectContextMenuItem(page, renamedRow, '删除')
    await expect(page.getByText(`删除“${smoke.renamedName}”？`)).toBeVisible()
    await page.getByRole('button', { name: '删除' }).click()

    await expect.poll(async () => {
      return page.evaluate(async ({ podUrl, renamedUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { resourceStatus: 0, metaStatus: 0 }
        const { filesAppMetaResourceUri } = await import('/src/modules/files/files-rdf-contract.ts')
        const [resourceResponse, metaResponse] = await Promise.all([
          authFetch(renamedUri),
          authFetch(filesAppMetaResourceUri(renamedUri, { currentPodRootUri: podUrl })),
        ])
        return {
          resourceStatus: resourceResponse.status,
          metaStatus: metaResponse.status,
        }
      }, smoke)
    }, { timeout: 30_000 }).toEqual({
      resourceStatus: 404,
      metaStatus: 404,
    })
  })

  test('saves markdown rich text edits through the Files editor sheet against a real Pod', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const stem = `linx-files-rich-${Date.now()}`
      const resourceUri = new URL(`${stem}.md`, podUrl).href
      const initialContent = '# Rich Smoke\n\nbefore rich save'
      const expectedContent = '# Rich Smoke\n\nbefore rich save after rich edit'
      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: initialContent,
      })
      if (!response.ok) {
        throw new Error(`failed to write rich smoke resource: ${response.status} ${await response.text()}`)
      }

      return {
        resourceUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        noteTitle: 'Rich Smoke',
        expectedContent,
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.fileName)
    const fileRow = page.getByRole('button', { name: smoke.fileName })
    await expect(fileRow).toBeVisible({ timeout: 30_000 })
    await fileRow.dblclick()

    const editorSheet = page.getByRole('dialog', { name: smoke.noteTitle })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await expect(editorSheet.getByTestId('rich-text-file-editor')).toBeVisible()

    const editor = editorSheet.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' after rich edit')
    await expect(editorSheet.getByText('未保存')).toBeVisible({ timeout: 10_000 })
    await editorSheet.getByRole('button', { name: '显示 Info' }).click()

    await expect.poll(async () => {
      return page.evaluate(async ({ resourceUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(resourceUri)
        return response.ok ? await response.text() : ''
      }, smoke)
    }, { timeout: 30_000 }).toBe(smoke.expectedContent)
  })

  test('copies and moves markdown resources through read/write fallback when WebDAV transfer is unsupported', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')
      const stem = `linx-files-transfer-${Date.now()}`
      const copySourceUri = new URL(`${stem}-copy.md`, podUrl).href
      const copyDestinationUri = new URL(`${stem}-copy-destination.md`, podUrl).href
      const moveSourceUri = new URL(`${stem}-move.md`, podUrl).href
      const moveDestinationUri = new URL(`${stem}-move-destination.md`, podUrl).href
      const copyContent = '# Copy Fallback Smoke\n\ncopy through GET PUT fallback'
      const moveContent = '# Move Fallback Smoke\n\nmove through GET PUT DELETE fallback'
      const fetchWithStage = async (
        stage: string,
        uri: string,
        init?: RequestInit,
      ): Promise<Response> => {
        try {
          return await authFetch(uri, init)
        } catch (error) {
          const reason = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error)
          throw new Error(JSON.stringify({
            message: `transfer smoke seed failed during ${stage}`,
            stage,
            uri,
            method: init?.method ?? 'GET',
            reason,
            dbStatus: (window as any).__SOLID_DB_STATUS__ ?? null,
            podUrl,
          }, null, 2))
        }
      }

      for (const [uri, content] of [
        [copySourceUri, copyContent],
        [moveSourceUri, moveContent],
      ] as const) {
        const response = await fetchWithStage('write transfer markdown resource', uri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: content,
        })
      if (!response.ok) {
        throw new Error(`failed to write ${uri}: ${response.status} ${await response.text()}`)
      }
    }

      const copySourceMetaUri = filesAppMetaResourceUri(copySourceUri, { currentPodRootUri: podUrl })
      const copyDestinationMetaUri = filesAppMetaResourceUri(copyDestinationUri, { currentPodRootUri: podUrl })
      const moveSourceMetaUri = filesAppMetaResourceUri(moveSourceUri, { currentPodRootUri: podUrl })
      const moveDestinationMetaUri = filesAppMetaResourceUri(moveDestinationUri, { currentPodRootUri: podUrl })
      const metaWrites: Response[] = []
      for (const [stage, uri, body] of [
        ['write copy source meta', copySourceMetaUri, filesMetaInsertDataPatch(copySourceMetaUri, [
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          `<${copySourceUri}> rdfs:label "Copy fallback metadata" ;`,
          '  dcterms:source <https://source.example/copy-fallback> .',
        ].join('\n'))],
        ['write move source meta', moveSourceMetaUri, filesMetaInsertDataPatch(moveSourceMetaUri, [
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          `<${moveSourceUri}> rdfs:label "Move fallback metadata" ;`,
          '  dcterms:source <https://source.example/move-fallback> .',
        ].join('\n'))],
      ] as const) {
        metaWrites.push(await fetchWithStage(stage, uri, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/sparql-update' },
          body,
        }))
      }
      const failedMetaWrite = metaWrites.find((response) => !response.ok)
      if (failedMetaWrite) {
        throw new Error(`failed to seed transfer meta: ${failedMetaWrite.status} ${await failedMetaWrite.text()}`)
      }

      return {
        podUrl,
        copySourceUri,
        copyDestinationUri,
        copySourceMetaUri,
        copyDestinationMetaUri,
        moveSourceUri,
        moveDestinationUri,
        moveSourceMetaUri,
        moveDestinationMetaUri,
        copyFileName: new URL(copySourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        copyDestinationName: new URL(copyDestinationUri).pathname.split('/').filter(Boolean).at(-1)!,
        moveFileName: new URL(moveSourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        moveDestinationName: new URL(moveDestinationUri).pathname.split('/').filter(Boolean).at(-1)!,
        copyContent,
        moveContent,
      }
    })

    const blockedTransfers: string[] = []
    const routeUnsupportedTransfer = async (sourceUri: string, method: 'COPY' | 'MOVE', status: 405 | 501) => {
      await page.route(sourceUri, async (route) => {
        const request = route.request()
        const requestMethod = request.method()
        const headers = request.headers()
        const origin = headers.origin ?? '*'
        const corsHeaders = {
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': headers['access-control-request-headers'] ?? 'authorization, content-type, destination, overwrite, if-none-match',
          'access-control-allow-methods': 'GET, PUT, DELETE, COPY, MOVE, OPTIONS',
          'access-control-allow-origin': origin,
          'access-control-expose-headers': 'content-type, etag, location, wac-allow',
          'cache-control': 'no-store',
        }

        if (requestMethod === 'OPTIONS' && headers['access-control-request-method'] === method) {
          await route.fulfill({ status: 204, headers: corsHeaders })
          return
        }

        if (requestMethod === method) {
          blockedTransfers.push(method)
          await route.fulfill({
            status,
            headers: {
              ...corsHeaders,
              'content-type': 'text/plain',
            },
            body: `${method} unsupported in e2e route`,
          })
          return
        }

        await route.continue()
      })
    }

    await routeUnsupportedTransfer(smoke.copySourceUri, 'COPY', 405)
    await routeUnsupportedTransfer(smoke.moveSourceUri, 'MOVE', 501)

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    const fileList = page.getByLabel('文件列表')
    await expect(fileList).toBeVisible({ timeout: 30_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.copyFileName)
    const copyRow = fileList.getByRole('button', { name: smoke.copyFileName })
    await expect(copyRow).toBeVisible({ timeout: 30_000 })
    await selectContextMenuItem(page, copyRow, '复制到...')
    const copyDialog = page.getByRole('dialog', { name: '复制到' })
    await expect(copyDialog).toBeVisible()
    await copyDialog.getByLabel('目标路径').fill(smoke.copyDestinationName)
    await expect(copyDialog.getByRole('button', { name: '复制' })).toBeEnabled()
    await copyDialog.getByRole('button', { name: '复制' }).click()
    await expect(copyDialog).toBeHidden({ timeout: 10_000 })

    await expect.poll(async () => {
      return page.evaluate(async ({ copySourceUri, copyDestinationUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { sourceStatus: 0, destinationStatus: 0, destinationText: '' }
        const [sourceResponse, destinationResponse] = await Promise.all([
          authFetch(copySourceUri),
          authFetch(copyDestinationUri),
        ])
        return {
          sourceStatus: sourceResponse.status,
          destinationStatus: destinationResponse.status,
          destinationText: destinationResponse.ok ? await destinationResponse.text() : '',
        }
      }, smoke)
    }, { timeout: 30_000 }).toEqual({
      sourceStatus: 200,
      destinationStatus: 200,
      destinationText: smoke.copyContent,
    })

    const copiedMeta = await page.evaluate(async ({ copySourceMetaUri, copyDestinationMetaUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) throw new Error('Solid DB authenticated fetch is not ready.')
      const [sourceResponse, destinationResponse] = await Promise.all([
        authFetch(copySourceMetaUri),
        authFetch(copyDestinationMetaUri),
      ])
      return {
        sourceStatus: sourceResponse.status,
        destinationStatus: destinationResponse.status,
        destinationText: destinationResponse.ok ? await destinationResponse.text() : '',
      }
    }, smoke)
    expect(copiedMeta.sourceStatus).toBe(200)
    expect(copiedMeta.destinationStatus).toBe(200)
    expect(copiedMeta.destinationText).toContain(`<${smoke.copyDestinationName}>`)
    expect(copiedMeta.destinationText).toContain('https://source.example/copy-fallback')
    expect(copiedMeta.destinationText).not.toContain(`<${smoke.copyFileName}>`)

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.moveFileName)
    const moveRow = fileList.getByRole('button', { name: smoke.moveFileName })
    await expect(moveRow).toBeVisible({ timeout: 30_000 })
    await selectContextMenuItem(page, moveRow, '移动到...')
    const moveDialog = page.getByRole('dialog', { name: '移动到' })
    await expect(moveDialog).toBeVisible()
    await moveDialog.getByLabel('目标路径').fill(smoke.moveDestinationName)
    await expect(moveDialog.getByRole('button', { name: '移动' })).toBeEnabled()
    await moveDialog.getByRole('button', { name: '移动' }).click()
    await expect(moveDialog).toBeHidden({ timeout: 10_000 })

    await expect.poll(async () => {
      return page.evaluate(async ({ moveSourceUri, moveDestinationUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { sourceStatus: 0, destinationStatus: 0, destinationText: '' }
        const [sourceResponse, destinationResponse] = await Promise.all([
          authFetch(moveSourceUri),
          authFetch(moveDestinationUri),
        ])
        return {
          sourceStatus: sourceResponse.status,
          destinationStatus: destinationResponse.status,
          destinationText: destinationResponse.ok ? await destinationResponse.text() : '',
        }
      }, smoke)
    }, { timeout: 30_000 }).toEqual({
      sourceStatus: 404,
      destinationStatus: 200,
      destinationText: smoke.moveContent,
    })

    const movedMeta = await page.evaluate(async ({ moveSourceMetaUri, moveDestinationMetaUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) throw new Error('Solid DB authenticated fetch is not ready.')
      const [sourceResponse, destinationResponse] = await Promise.all([
        authFetch(moveSourceMetaUri),
        authFetch(moveDestinationMetaUri),
      ])
      return {
        sourceStatus: sourceResponse.status,
        destinationStatus: destinationResponse.status,
        destinationText: destinationResponse.ok ? await destinationResponse.text() : '',
      }
    }, smoke)
    expect(movedMeta.sourceStatus).toBe(404)
    expect(movedMeta.destinationStatus).toBe(200)
    expect(movedMeta.destinationText).toContain(`<${smoke.moveDestinationName}>`)
    expect(movedMeta.destinationText).toContain('https://source.example/move-fallback')
    expect(movedMeta.destinationText).not.toContain(`<${smoke.moveFileName}>`)

    expect(blockedTransfers).toEqual(['COPY', 'MOVE'])
  })

  test('copies and moves markdown resources with Finder-style target paths against a real Pod', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const stem = `linx-files-path-transfer-${Date.now()}`
      const archiveName = `${stem}-archive`
      const copySourceName = `${stem}-copy.md`
      const copyDestinationName = `${stem}-copy-destination.md`
      const moveSourceName = `${stem}-move.md`
      const moveDestinationName = `${stem}-move-destination.md`
      const archiveUri = new URL(`${archiveName}/`, podUrl).href
      const copySourceUri = new URL(copySourceName, podUrl).href
      const copyDestinationUri = new URL(copyDestinationName, podUrl).href
      const moveSourceUri = new URL(moveSourceName, podUrl).href
      const moveDestinationUri = new URL(`${archiveName}/${moveDestinationName}`, podUrl).href
      const copyContent = '# Finder Path Copy\n\ncopy through relative target path'
      const moveContent = '# Finder Path Move\n\nmove through nested relative target path'

      const createArchive = await authFetch(podUrl, {
        method: 'POST',
        headers: {
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: archiveName,
        },
      })
      if (![200, 201, 204, 409].includes(createArchive.status)) {
        throw new Error(`failed to create archive folder: ${createArchive.status} ${await createArchive.text()}`)
      }

      for (const [uri, content] of [
        [copySourceUri, copyContent],
        [moveSourceUri, moveContent],
      ] as const) {
        const response = await authFetch(uri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: content,
        })
        if (!response.ok) {
          throw new Error(`failed to write ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      return {
        podUrl,
        archiveName,
        archiveUri,
        copySourceName,
        copyDestinationName,
        moveSourceName,
        moveDestinationName,
        moveTargetPath: `${archiveName}/${moveDestinationName}`,
        copySourceUri,
        copyDestinationUri,
        moveSourceUri,
        moveDestinationUri,
        copyContent,
        moveContent,
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    const fileList = page.getByLabel('文件列表')
    await expect(fileList).toBeVisible({ timeout: 30_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.copySourceName)
    const copyRow = fileList.getByRole('button', { name: smoke.copySourceName })
    await expect(copyRow).toBeVisible({ timeout: 30_000 })
    await selectContextMenuItem(page, copyRow, '复制到...')
    const copyDialog = page.getByRole('dialog', { name: '复制到' })
    await expect(copyDialog).toBeVisible()
    const copyTargetInput = copyDialog.getByLabel('目标路径')
    await copyTargetInput.fill('../escape.md')
    await expect(copyDialog.getByText('目标路径不能离开当前文件夹')).toBeVisible()
    await expect(copyDialog.getByRole('button', { name: '复制' })).toBeDisabled()
    await copyTargetInput.fill(smoke.copyDestinationName)
    await expect(copyDialog.getByRole('button', { name: '复制' })).toBeEnabled()
    await copyDialog.getByRole('button', { name: '复制' }).click()
    await expect(copyDialog).toBeHidden({ timeout: 10_000 })

    await expect.poll(async () => {
      return page.evaluate(async ({ copySourceUri, copyDestinationUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { sourceStatus: 0, destinationStatus: 0, destinationText: '' }
        const [sourceResponse, destinationResponse] = await Promise.all([
          authFetch(copySourceUri),
          authFetch(copyDestinationUri),
        ])
        return {
          sourceStatus: sourceResponse.status,
          destinationStatus: destinationResponse.status,
          destinationText: destinationResponse.ok ? await destinationResponse.text() : '',
        }
      }, smoke)
    }, { timeout: 30_000 }).toEqual({
      sourceStatus: 200,
      destinationStatus: 200,
      destinationText: smoke.copyContent,
    })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.moveSourceName)
    const moveRow = fileList.getByRole('button', { name: smoke.moveSourceName })
    await expect(moveRow).toBeVisible({ timeout: 30_000 })
    await selectContextMenuItem(page, moveRow, '移动到...')
    const moveDialog = page.getByRole('dialog', { name: '移动到' })
    await expect(moveDialog).toBeVisible()
    await moveDialog.getByLabel('目标路径').fill(smoke.moveTargetPath)
    await expect(moveDialog.getByRole('button', { name: '移动' })).toBeEnabled()
    await moveDialog.getByRole('button', { name: '移动' }).click()
    await expect(moveDialog).toBeHidden({ timeout: 10_000 })

    await expect.poll(async () => {
      return page.evaluate(async ({ moveSourceUri, moveDestinationUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { sourceStatus: 0, destinationStatus: 0, destinationText: '' }
        const [sourceResponse, destinationResponse] = await Promise.all([
          authFetch(moveSourceUri),
          authFetch(moveDestinationUri),
        ])
        return {
          sourceStatus: sourceResponse.status,
          destinationStatus: destinationResponse.status,
          destinationText: destinationResponse.ok ? await destinationResponse.text() : '',
        }
      }, smoke)
    }, { timeout: 30_000 }).toEqual({
      sourceStatus: 404,
      destinationStatus: 200,
      destinationText: smoke.moveContent,
    })

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('opens a real Turtle resource as an embedded structured table with right-side meta', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri } = await import('/src/modules/files/files-rdf-contract.ts')

      const resourceUri = new URL(`linx-files-structured-${Date.now()}.ttl`, podUrl).href
      const metaUri = filesAppMetaResourceUri(resourceUri, { currentPodRootUri: podUrl })
      const content = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ;',
        '  udfs:title "Files E2E" ;',
        '  udfs:mode "read/write" .',
        '',
      ].join('\n')

      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: content,
      })
      if (!response.ok) {
        throw new Error(`failed to write ${resourceUri}: ${response.status} ${await response.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        metaUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.evaluate(async ({ resourceUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(resourceUri)
    }, smoke)
    const workspace = page.getByLabel('文件工作区')
    await expect(workspace.getByText(smoke.fileName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: '当前 class：Workspace' })).toBeVisible()
    await expect(workspace.getByRole('button', { name: '#Workspace' })).toBeVisible()
    await expect(workspace.getByText('https://undefineds.co/vocab/Workspace')).toHaveCount(0)
    await expect(page.getByText('"Files E2E"')).toBeVisible()
    await expect(page.getByRole('dialog', { name: smoke.fileName })).toHaveCount(0)

    await page.getByRole('button', { name: '查看 .meta' }).click()
    const drawer = page.getByLabel('Resource .meta inspector')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(smoke.metaUri)
    await expect(drawer).toContainText('状态')
    await expect(drawer).toContainText('已连接')
    await expect(drawer).toContainText('text/turtle')

    const metaWriteResponses: Array<{ method: string; status: number; body: string }> = []
    page.on('response', async (response) => {
      const method = response.request().method()
      if (response.url() !== smoke.metaUri || (method !== 'PATCH' && method !== 'PUT')) return
      metaWriteResponses.push({
        method,
        status: response.status(),
        body: await response.text().catch(() => ''),
      })
    })

    await page.getByRole('button', { name: '关闭 .meta inspector' }).click()
    await page.getByRole('button', { name: '+ 视图' }).click()
    await expect(page.getByRole('menuitem', { name: 'Raw' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Raw' }).click()
    await expect(page.getByRole('heading', { name: '当前视图文本' })).toBeVisible()
    await expect(workspace.getByText('当前筛选、predicate 可见性和待确认更改后的投影视图。')).toBeVisible()
    await expect(workspace.getByText('#Workspace')).toBeVisible()
    await expect(workspace.getByText('"Files E2E"')).toBeVisible()
    await page.getByRole('button', { name: '+ 视图' }).click()
    await page.getByRole('menuitem', { name: 'Kanban' }).click()
    await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible()

    await expect.poll(() => metaWriteResponses.some((response) => response.status >= 200 && response.status < 300), {
      timeout: 30_000,
    }).toBe(true)
    const failedPatch = metaWriteResponses.find((response) => response.method === 'PATCH' && response.status >= 400)
    if (failedPatch) {
      expect([405, 501], failedPatch.body).toContain(failedPatch.status)
    }

    await expect.poll(async () => {
      return page.evaluate(async ({ metaUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(metaUri)
        return response.ok ? await response.text() : ''
      }, smoke)
    }, { timeout: 30_000 }).toContain('StructuredViewMetadata')

    const persistedView = await page.evaluate(async ({ resourceUri, metaUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [resourceResponse, metaResponse] = await Promise.all([
        authFetch(resourceUri),
        authFetch(metaUri),
      ])
      return {
        resourceStatus: resourceResponse.status,
        resourceText: await resourceResponse.text(),
        metaStatus: metaResponse.status,
        metaText: await metaResponse.text(),
      }
    }, smoke)

    expect(persistedView.resourceStatus).toBe(200)
    expect(persistedView.resourceText).toContain('"Files E2E"')
    expect(persistedView.resourceText).not.toContain('StructuredViewMetadata')
    expect(persistedView.metaStatus).toBe(200)
    expect(persistedView.metaText).toContain('viewMode> "kanban"')
    expect(persistedView.metaText).toContain('writesCanonicalData> false')

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('hydrates real vocab shape rules as required schema columns with shape-warning filters', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      await ensureContainer('.data/')
      await ensureContainer('.vocab/')

      const stem = `shape-required-${Date.now()}`
      const resourceUri = new URL(`.data/${stem}.ttl`, podUrl).href
      const termsUri = new URL('.vocab/terms.ttl', podUrl).href
      const shapesUri = new URL('.vocab/shapes.ttl', podUrl).href
      const namespacesUri = new URL('.vocab/namespaces.ttl', podUrl).href
      const ownerTermUri = new URL('.vocab/terms.ttl#owner', podUrl).href
      const dataContent = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ;',
        '  udfs:title "Shape Required Workspace" .',
        '<#Complete> a udfs:Workspace ;',
        '  udfs:title "Complete Workspace" ;',
        '  udfs:owner "team" .',
        '',
      ].join('\n')
      const termsContent = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '<> a udfs:VocabTermRegistry .',
        '<#owner> a udfs:PredicateTerm ;',
        '  rdfs:label "owner" ;',
        '  rdfs:comment "Owner of this workspace." ;',
        '  udfs:predicate <https://undefineds.co/vocab/owner> ;',
        '  udfs:valueType "text" .',
        '',
      ].join('\n')
      const shapesContent = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '<> a udfs:VocabShapeRegistry .',
        '<#owner-required> a udfs:ShapeRule ;',
        '  rdfs:label "Owner required" ;',
        `  udfs:term <${ownerTermUri}> ;`,
        '  udfs:classScope "udfs:Workspace" ;',
        '  udfs:constraint "minCount 1" ;',
        '  udfs:status "active" .',
        '',
      ].join('\n')
      const namespacesContent = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix sh: <http://www.w3.org/ns/shacl#> .',
        '<> a udfs:VocabNamespaceRegistry .',
        '<#udfs> a udfs:Namespace ;',
        '  sh:prefix "udfs" ;',
        '  sh:namespace "https://undefineds.co/vocab/" .',
        '',
      ].join('\n')

      const writes = await Promise.all([
        authFetch(resourceUri, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: dataContent }),
        authFetch(termsUri, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: termsContent }),
        authFetch(shapesUri, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: shapesContent }),
        authFetch(namespacesUri, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: namespacesContent }),
      ])
      const failed = writes.find((response) => !response.ok)
      if (failed) {
        throw new Error(`failed to seed shape required smoke: ${failed.status} ${await failed.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await page.evaluate(async ({ resourceUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(resourceUri)
    }, smoke)

    const workspace = page.getByLabel('文件工作区')
    await expect(workspace.getByText(smoke.fileName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: '当前 class：Workspace' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('columnheader', { name: /owner/ })).toBeVisible()
    await expect(workspace.getByText(/1 个校验提醒/)).toBeVisible()
    await expect(workspace.getByText(/owner has 0 values; minCount is 1\./)).toBeVisible()

    await page.getByRole('button', { name: '筛选', exact: true }).click()
    await page.getByRole('menuitemcheckbox', { name: '有校验提醒的 subject' }).click()
    await expect(workspace.getByRole('button', { name: /#Workspace/ })).toBeVisible()
    await expect(workspace.getByRole('button', { name: /#Complete/ })).toHaveCount(0)

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('opens a real structured subject resource from peek and restores table context on return', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      await ensureContainer('.data/')

      const stem = `subject-open-${Date.now()}`
      const markdownUri = new URL(`.data/${stem}.md`, podUrl).href
      const tableUri = new URL(`.data/${stem}.ttl`, podUrl).href
      const markdownMetaUri = filesAppMetaResourceUri(markdownUri, { currentPodRootUri: podUrl })
      const markdownContent = '# Subject Linked Note\n\nOpened from a structured table subject.'
      const tableContent = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        `  <${markdownUri}> a udfs:Workspace ;`,
        '  udfs:title "Subject Linked Note" ;',
        '  udfs:mode "edit" .',
        '',
      ].join('\n')
      const metaContent = [
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '',
        `  <${markdownUri}>`,
        '    rdfs:label "Subject Linked Note" ;',
        '    dcterms:source <https://source.example/subject-open-smoke> ;',
        `  rdfs:seeAlso <${tableUri}> ;`,
        `  udfs:vocab <${new URL('.vocab/terms.ttl', podUrl).href}> .`,
      ].join('\n')

      const [markdownWrite, tableWrite] = await Promise.all([
        authFetch(markdownUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: markdownContent,
        }),
        authFetch(tableUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/turtle' },
          body: tableContent,
        }),
      ])
      if (!markdownWrite.ok) {
        throw new Error(`failed to write markdown subject resource: ${markdownWrite.status} ${await markdownWrite.text()}`)
      }
      if (!tableWrite.ok) {
        throw new Error(`failed to write structured subject table: ${tableWrite.status} ${await tableWrite.text()}`)
      }

      const metaWrite = await authFetch(markdownMetaUri, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: filesMetaInsertDataPatch(markdownMetaUri, metaContent),
      })
      if (!metaWrite.ok) {
        throw new Error(`failed to write markdown subject meta: ${metaWrite.status} ${await metaWrite.text()}`)
      }

      return {
        podUrl,
        tableUri,
        tableName: new URL(tableUri).pathname.split('/').filter(Boolean).at(-1)!,
        markdownUri,
        markdownName: new URL(markdownUri).pathname.split('/').filter(Boolean).at(-1)!,
        markdownMetaUri,
        noteTitle: 'Subject Linked Note',
      }
    })

    const writeRequests: Array<{ method: string; url: string }> = []
    page.on('request', (request) => {
      const method = request.method()
      if (method !== 'PATCH' && method !== 'PUT' && method !== 'POST' && method !== 'DELETE') return
      const url = request.url()
      if (!url.includes('/.data/proposals/') && !url.includes('/.data/ingest/')) return
      writeRequests.push({ method, url })
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.evaluate(async ({ tableUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(tableUri)
    }, smoke)
    const workspace = page.getByLabel('文件工作区')
    await expect(workspace.getByText(smoke.tableName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: '当前 class：Workspace' })).toBeVisible()
    await expect(workspace.getByText('https://undefineds.co/vocab/Workspace')).toHaveCount(0)
    await expect(page.getByText('"Subject Linked Note"')).toBeVisible()

    const subjectCell = page.locator(`[data-structured-subject-open="${smoke.markdownUri}"]`)
    await expect(subjectCell).toBeVisible({ timeout: 30_000 })
    await subjectCell.click()

    const subjectSidecar = page.getByLabel('Structured subject peek')
    await expect(subjectSidecar).toBeVisible({ timeout: 10_000 })
    await expect(subjectSidecar).toContainText('卡片预览')
    await expect(subjectSidecar).toContainText(smoke.markdownName)
    await expect(subjectSidecar).not.toContainText(smoke.markdownUri)
    await subjectSidecar.getByRole('button', { name: '查看 URI 详情' }).click()
    await expect(subjectSidecar).toContainText(smoke.markdownUri)
    await expect(page.getByRole('dialog', { name: smoke.noteTitle })).toHaveCount(0)
    await expect(workspace.getByText(smoke.tableName, { exact: true }).first()).toBeVisible()

    await subjectSidecar.getByRole('button', { name: '打开资源' }).click()

    const editorSheet = page.getByRole('dialog', { name: smoke.noteTitle })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await expect(editorSheet.getByTestId('rich-text-file-editor')).toBeVisible()
    await expect(editorSheet.getByText('Opened from a structured table subject.')).toBeVisible()
    const metaTail = editorSheet.getByLabel('文件 meta')
    await expect(metaTail).toContainText(smoke.markdownMetaUri)
    await expect(metaTail).toContainText('https://source.example/subject-open-smoke')

    await editorSheet.getByRole('button', { name: `返回来源表 · ${smoke.markdownUri}` }).click()
    await expect(editorSheet).toHaveCount(0)
    await expect(workspace.getByText(smoke.tableName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: smoke.noteTitle })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '当前 class：Workspace' })).toBeVisible()
    await expect(workspace.getByText('https://undefineds.co/vocab/Workspace')).toHaveCount(0)
    await expect(page.getByText('"Subject Linked Note"')).toBeVisible()
    await expect(subjectCell).toBeFocused()
    expect(writeRequests).toEqual([])

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('persists Whiteboard selected subjects to resource .meta without rewriting source Turtle', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri } = await import('/src/modules/files/files-rdf-contract.ts')

      const resourceUri = new URL(`linx-files-whiteboard-${Date.now()}.ttl`, podUrl).href
      const metaUri = filesAppMetaResourceUri(resourceUri, { currentPodRootUri: podUrl })
      const content = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ;',
        '  udfs:title "Files Whiteboard E2E" ;',
        '  udfs:mode "read/write" ;',
        '  udfs:related <#Other> .',
        '<#Other> a udfs:Workspace ;',
        '  udfs:title "Whiteboard Peer" ;',
        '  udfs:mode "read" .',
        '',
      ].join('\n')

      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: content,
      })
      if (!response.ok) {
        throw new Error(`failed to write ${resourceUri}: ${response.status} ${await response.text()}`)
      }
      const verify = await authFetch(resourceUri)
      if (!verify.ok) {
        throw new Error(`failed to verify ${resourceUri}: ${verify.status} ${await verify.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        metaUri,
        workspaceSubject: `${resourceUri}#Workspace`,
        otherSubject: `${resourceUri}#Other`,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        canonicalSource: await verify.text(),
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.evaluate(async ({ resourceUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(resourceUri)
    }, smoke)
    await expect(page.getByLabel('文件工作区').getByText(smoke.fileName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('#Workspace')).toBeVisible()
    await expect(page.getByText('"Files Whiteboard E2E"')).toBeVisible()

    await page.getByRole('button', { name: '查看 .meta' }).click()
    const drawer = page.getByLabel('Resource .meta inspector')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(smoke.metaUri)

    const metaWriteResponses: Array<{ method: string; status: number; body: string }> = []
    const sourceWriteResponses: Array<{ method: string; status: number; body: string }> = []
    page.on('response', async (response) => {
      const method = response.request().method()
      if (method !== 'PATCH' && method !== 'PUT') return
      if (response.url() === smoke.metaUri) {
        metaWriteResponses.push({
          method,
          status: response.status(),
          body: await response.text().catch(() => ''),
        })
      }
      if (response.url() === smoke.resourceUri) {
        sourceWriteResponses.push({
          method,
          status: response.status(),
          body: await response.text().catch(() => ''),
        })
      }
    })

    await page.getByRole('button', { name: '关闭 .meta inspector' }).click()
    await page.getByRole('button', { name: '+ 视图' }).click()
    await page.getByRole('menuitem', { name: 'Whiteboard' }).click()
    await expect(page.getByRole('button', { name: 'Whiteboard', exact: true })).toBeVisible()

    const addWhiteboardSubject = async (subject: string) => {
      const whiteboardToolsButton = page.getByRole('button', { name: '白板工具' })
      await whiteboardToolsButton.focus()
      await page.keyboard.press('Enter')
      const subjectItem = page.getByRole('menuitem').filter({ hasText: subject }).first()
      await expect(subjectItem).toBeVisible({ timeout: 5_000 })
      await subjectItem.click()
    }

    await addWhiteboardSubject('#Workspace')
    await expect(page.locator(`[data-whiteboard-subject="${smoke.workspaceSubject}"]`)).toHaveCount(1)
    await addWhiteboardSubject('#Other')
    await expect(page.locator(`[data-whiteboard-subject="${smoke.otherSubject}"]`)).toHaveCount(1)
    await expect(page.getByText('白板中 2 张卡片')).toBeVisible()

    await page.getByRole('button', { name: '白板工具' }).click()
    await page.getByRole('menuitem', { name: '添加视觉关系' }).click()
    await page.getByLabel('Relation label').fill('e2e sketch link')
    await page.getByRole('button', { name: '创建视觉关系' }).click()
    await expect(page.locator('[data-whiteboard-relation-source="visual"]')).toHaveCount(1)

    const workspaceNode = page.locator(`[data-whiteboard-subject="${smoke.workspaceSubject}"]`)
    const initialWorkspacePosition = await workspaceNode.evaluate((element) => ({
      x: Number((element as HTMLElement).dataset.layoutX),
      y: Number((element as HTMLElement).dataset.layoutY),
    }))
    const workspaceBox = await workspaceNode.boundingBox()
    expect(workspaceBox).toBeTruthy()
    await page.mouse.move(workspaceBox!.x + 24, workspaceBox!.y + 24)
    await page.mouse.down()
    await page.mouse.move(workspaceBox!.x + 144, workspaceBox!.y + 88, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => {
      const nextPosition = await workspaceNode.evaluate((element) => ({
        x: Number((element as HTMLElement).dataset.layoutX),
        y: Number((element as HTMLElement).dataset.layoutY),
      }))
      return Math.abs(nextPosition.x - initialWorkspacePosition.x) + Math.abs(nextPosition.y - initialWorkspacePosition.y)
    }, { timeout: 10_000 }).toBeGreaterThan(20)
    const movedWorkspacePosition = await workspaceNode.evaluate((element) => ({
      x: Number((element as HTMLElement).dataset.layoutX),
      y: Number((element as HTMLElement).dataset.layoutY),
    }))
    const subjectPeek = page.getByLabel('Structured subject peek')
    if (await subjectPeek.isVisible({ timeout: 500 }).catch(() => false)) {
      await subjectPeek.getByRole('button', { name: '取消' }).click()
      await expect(subjectPeek).toHaveCount(0)
    }

    await expect.poll(() => metaWriteResponses.some((response) => response.status >= 200 && response.status < 300), {
      timeout: 30_000,
    }).toBe(true)
    const failedPatch = metaWriteResponses.find((response) => response.method === 'PATCH' && response.status >= 400)
    if (failedPatch) {
      expect([405, 501], failedPatch.body).toContain(failedPatch.status)
    }

    await expect.poll(async () => {
      return page.evaluate(async ({ metaUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(metaUri)
        return response.ok ? await response.text() : ''
      }, smoke)
    }, { timeout: 30_000 }).toContain('e2e sketch link')

    const persistedView = await page.evaluate(async ({ resourceUri, metaUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [resourceResponse, metaResponse] = await Promise.all([
        authFetch(resourceUri),
        authFetch(metaUri),
      ])
      return {
        resourceStatus: resourceResponse.status,
        resourceText: await resourceResponse.text(),
        metaStatus: metaResponse.status,
        metaText: await metaResponse.text(),
      }
    }, smoke)

    expect(sourceWriteResponses).toEqual([])
    expect(persistedView.resourceStatus).toBe(200)
    expect(persistedView.resourceText).toBe(smoke.canonicalSource)
    expect(persistedView.resourceText).not.toContain('StructuredViewMetadata')
    expect(persistedView.resourceText).not.toContain('whiteboardVisualRelation')
    expect(persistedView.resourceText).not.toContain('e2e sketch link')
    expect(persistedView.metaStatus).toBe(200)
    expect(persistedView.metaText).toContain('StructuredViewMetadata')
    expect(persistedView.metaText).toContain('viewMode> "whiteboard"')
    expect(persistedView.metaText).toContain('selectedSubject>')
    expect(persistedView.metaText).toContain(`"${smoke.workspaceSubject}"`)
    expect(persistedView.metaText).toContain(`"${smoke.otherSubject}"`)
    expect(persistedView.metaText).toContain('whiteboardPosition')
    expect(persistedView.metaText).toMatch(new RegExp(`(?:udfs:x|x>)\\s+${Math.round(movedWorkspacePosition.x)}\\b`))
    expect(persistedView.metaText).toMatch(new RegExp(`(?:udfs:y|y>)\\s+${Math.round(movedWorkspacePosition.y)}\\b`))
    expect(persistedView.metaText).toContain('whiteboardVisualRelation')
    expect(persistedView.metaText).toContain(`fromSubject> "${smoke.workspaceSubject}"`)
    expect(persistedView.metaText).toContain(`toSubject> "${smoke.otherSubject}"`)
    expect(persistedView.metaText).toContain('label> "e2e sketch link"')
    expect(persistedView.metaText).toContain('writesCanonicalData> false')

    await page.evaluate(() => {
      localStorage.removeItem('linx.files.structuredViewConfigs.v1')
      localStorage.removeItem('linx.files.structuredWhiteboardLayouts.v1')
    })
    await page.reload()
    await page.waitForFunction(
      () => (window as any).__SOLID_DB_STATUS__ === 'ready' && Boolean((window as any).__SOLID_DB__),
      null,
      { timeout: 30_000 },
    )
    await expect(page.getByRole('heading', { name: '选择空间' })).toHaveCount(0)
    const filesNavButtonAfterReload = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButtonAfterReload).toBeVisible({ timeout: 10_000 })
    await filesNavButtonAfterReload.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await page.evaluate(async ({ resourceUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(resourceUri)
    }, smoke)

    await expect(page.getByRole('button', { name: 'Whiteboard', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`[data-whiteboard-subject="${smoke.workspaceSubject}"]`)).toHaveCount(1)
    await expect(page.locator(`[data-whiteboard-subject="${smoke.otherSubject}"]`)).toHaveCount(1)
    const hydratedWhiteboardState = await page.evaluate(async ({ metaUri, resourceUri, workspaceSubject }) => {
      const { parseStructuredViewMetadataTurtle } = await import('/src/modules/files/structured-view-metadata.ts')
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) throw new Error('Solid DB authenticated fetch is not ready.')
      const response = await authFetch(metaUri)
      const metaText = response.ok ? await response.text() : ''
      const parsed = parseStructuredViewMetadataTurtle(metaText, resourceUri)
      return {
        parsedPositions: parsed.whiteboard.positions,
        parsedPosition: parsed.whiteboard.positions[workspaceSubject] ?? null,
        storePositions: useFilesStore.getState().structuredWhiteboardLayoutsByDocument[resourceUri] ?? null,
        storePosition: useFilesStore.getState().structuredWhiteboardLayoutsByDocument[resourceUri]?.[workspaceSubject] ?? null,
      }
    }, smoke)
    expect(hydratedWhiteboardState.parsedPositions).toEqual(expect.objectContaining({
      [smoke.workspaceSubject]: {
        x: Math.round(movedWorkspacePosition.x),
        y: Math.round(movedWorkspacePosition.y),
      },
    }))
    expect(hydratedWhiteboardState.parsedPosition).toEqual({
      x: Math.round(movedWorkspacePosition.x),
      y: Math.round(movedWorkspacePosition.y),
    })
    expect(hydratedWhiteboardState.storePosition).toEqual({
      x: Math.round(movedWorkspacePosition.x),
      y: Math.round(movedWorkspacePosition.y),
    })
    await expect(page.locator(`[data-whiteboard-subject="${smoke.workspaceSubject}"]`)).toHaveAttribute('data-layout-x', String(Math.round(movedWorkspacePosition.x)))
    await expect(page.locator(`[data-whiteboard-subject="${smoke.workspaceSubject}"]`)).toHaveAttribute('data-layout-y', String(Math.round(movedWorkspacePosition.y)))
    await expect(page.locator('[data-whiteboard-relation-source="visual"]')).toHaveCount(1)
    await expect(page.getByText('白板中 2 张卡片')).toBeVisible()
    expect(sourceWriteResponses).toEqual([])

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('imports a fetchable URL as a source-linked card with ingest artifacts', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const sourceUri = 'https://source.example/linx-e2e-source.html'
    let routedSourceBody = [
      '<!doctype html>',
      '<html>',
      '<head><title>Source Ingest E2E</title><meta name="description" content="Ingest source smoke"></head>',
      '<body>',
      '<nav>Navigation should not be imported</nav>',
      '<main><h1>Source Ingest E2E</h1><p>Extracted URL body from Playwright route.</p></main>',
      '<script>window.bad = true</script>',
      '</body>',
      '</html>',
    ].join('')
    await page.route(sourceUri, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
        },
        body: routedSourceBody,
      })
    })

    const smoke = await page.evaluate(async ({ sourceUri }) => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const stableShortHash = (value: string) => {
        let hash = 2166136261
        for (let index = 0; index < value.length; index += 1) {
          hash ^= value.charCodeAt(index)
          hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7)
      }
      const slugify = (value: string) => {
        const slug = value
          .trim()
          .replace(/^[#./]+/, '')
          .replace(/[^A-Za-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .toLowerCase()
        return slug || 'source'
      }
      const sourceSlug = (uri: string) => {
        const url = new URL(uri)
        const path = url.pathname.replace(/\.[A-Za-z0-9]+$/, '')
        return `${slugify(`${url.hostname}${path}`)}-${stableShortHash(uri)}`
      }
      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      const manifestFolder = `.data/ingest/sources/${sourceSlug(sourceUri)}/`
      for (const path of [
        'inbox/',
        '.data/',
        '.data/approvals/',
        '.data/audits/',
        '.data/proposals/',
        '.data/proposals/source/',
        '.data/ingest/',
        '.data/ingest/sources/',
        manifestFolder,
      ]) {
        await ensureContainer(path)
      }

      return {
        podUrl,
        proposalContainerUri: new URL('.data/proposals/source/', podUrl).href,
        sourceUri,
      }
    }, { sourceUri })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    const podRootTreeItem = page.getByRole('treeitem', { name: /Pod 根目录/ })
    await expect(podRootTreeItem).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('span'))
      const podRootLabel = labels.find((element) => element.textContent?.includes('Pod 根目录'))
      const clickableRow = podRootLabel?.closest('div.cursor-pointer') as HTMLElement | null
      clickableRow?.click()
    })

    const title = `Source Ingest ${Date.now()}`
    const failedWrites: Array<{ method: string; url: string; status: number; body: string }> = []
    page.on('response', async (response) => {
      const method = response.request().method()
      if (!['PUT', 'PATCH', 'POST'].includes(method) || response.status() < 400) return
      failedWrites.push({
        method,
        url: response.url(),
        status: response.status(),
        body: await response.text().catch(() => ''),
      })
    })
    await page.getByRole('button', { name: 'Ingest 来源' }).click()
    await page.getByLabel('来源地址').fill(sourceUri)
    await page.getByLabel('卡片标题').fill(title)
    const importButton = page.getByRole('button', { name: '创建 Ingest 卡片', exact: true })
    await expect(importButton).toBeEnabled()
    await importButton.click()

    const importedStatus = page.getByText('已创建 Ingest 卡片')
    try {
      await expect(importedStatus).toBeVisible({ timeout: 30_000 })
    } catch (error) {
      const statusText = await page.getByRole('status').allTextContents().catch(() => [])
      throw new Error(`Source Ingest did not complete: ${JSON.stringify({ statusText, failedWrites })}`, { cause: error })
    }
    const cardUri = await importedStatus.getAttribute('title')
    expect(cardUri).toContain('.card.ttl')

    const workspace = page.getByLabel('文件工作区')
    await expect(workspace.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 })
    await expect(workspace.getByText('确认 Ingest 审批后才会写入正文资源。')).toBeVisible()

    const persisted = await page.evaluate(async ({ cardUri, proposalContainerUri, sourceUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch || !cardUri) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const readText = async (uri: string) => {
        const response = await authFetch(uri)
        return {
          status: response.status,
          text: await response.text(),
        }
      }

      const card = await readText(cardUri)
      const bodyUri = card.text.match(/(?:udfs:bodyResource|<https:\/\/undefineds\.co\/vocab\/bodyResource>)\s+<([^>]+)>/)?.[1] ?? null
      const manifestUri = card.text.match(/(?:udfs:ingestManifest|<https:\/\/undefineds\.co\/vocab\/ingestManifest>)\s+<([^>]+)>/)?.[1] ?? null
      if (!bodyUri || !manifestUri) {
        throw new Error(`source-linked card is missing body or manifest links: ${card.text}`)
      }
      const [body, manifest, proposals] = await Promise.all([
        readText(bodyUri),
        readText(manifestUri),
        readText(proposalContainerUri),
      ])
      const absoluteProposalUris = Array.from(proposals.text.matchAll(/https?:\/\/[^\s<>"']+\.ttl/g))
        .map((match) => match[0])
      const relativeProposalUris = Array.from(proposals.text.matchAll(/<([^>]+\.ttl)>/g))
        .map((match) => new URL(match[1]!, proposalContainerUri).href)
      const proposalUris = Array.from(new Set([...absoluteProposalUris, ...relativeProposalUris]))
        .filter((uri) => uri.includes('/.data/proposals/source/'))
      const proposalResources = await Promise.all(proposalUris.map(async (uri) => ({
        uri,
        resource: await readText(uri),
      })))
      const proposal = proposalResources.find(({ resource }) =>
        resource.status === 200
        && resource.text.includes(`<${bodyUri}>`)
        && resource.text.includes(`<${manifestUri}>`)
        && resource.text.includes(`<${sourceUri}>`),
      )
      if (!proposal) {
        throw new Error(`source proposal not found for imported card: ${proposals.text}`)
      }

      return {
        card,
        bodyUri,
        body,
        manifestUri,
        manifest,
        proposalContainer: proposals,
        proposalUri: proposal.uri,
        proposal: proposal.resource,
      }
    }, { cardUri, proposalContainerUri: smoke.proposalContainerUri, sourceUri })

    expect(persisted.card.status).toBe(200)
    expect(persisted.card.text).toMatch(/(?:udfs:SourceLinkedCard|<https:\/\/undefineds\.co\/vocab\/SourceLinkedCard>)/)
    expect(persisted.card.text).toMatch(new RegExp(`(?:dcterms:source|<http://purl\\.org/dc/terms/source>)\\s+<${escapeRegExp(sourceUri)}>`))
    expect(persisted.card.text).toMatch(new RegExp(`(?:udfs:ingestManifest|<https://undefineds\\.co/vocab/ingestManifest>)\\s+<${escapeRegExp(persisted.manifestUri)}>`))
    expect(persisted.card.text).not.toContain('parserManifest')
    expect(persisted.manifestUri).toContain('/.data/ingest/sources/')
    expect(persisted.manifestUri).not.toContain('/.data/index/sources/')
    expect(persisted.body.status).toBe(404)
    expect(persisted.body.text).not.toContain('Navigation should not be imported')
    expect(persisted.manifest.status).toBe(200)
    expect(persisted.manifest.text).toMatch(/(?:udfs:SourceIngestManifest|<https:\/\/undefineds\.co\/vocab\/SourceIngestManifest>)/)
    expect(persisted.manifest.text).toMatch(/(?:udfs:ingestStatus|<https:\/\/undefineds\.co\/vocab\/ingestStatus>)\s+"complete"/)
    expect(persisted.manifest.text).toMatch(/(?:udfs:totalChunks|<https:\/\/undefineds\.co\/vocab\/totalChunks>)\s+1/)
    expect(persisted.manifest.text).not.toContain('SourceIndexManifest')
    expect(persisted.manifest.text).not.toContain('parserStatus')
    expect(persisted.proposalContainer.status).toBe(200)
    expect(persisted.proposalContainer.text).toContain('.ttl')
    expect(persisted.proposal.status).toBe(200)
    expect(persisted.proposal.text).toMatch(/(?:udfs:SourceUpdateProposal|<https:\/\/undefineds\.co\/vocab\/SourceUpdateProposal>)/)
    expect(persisted.proposal.text).toMatch(new RegExp(`(?:udfs:targetResource|<https://undefineds\\.co/vocab/targetResource>)\\s+<${escapeRegExp(persisted.bodyUri)}>`))
    expect(persisted.proposal.text).toMatch(new RegExp(`(?:udfs:ingestManifest|<https://undefineds\\.co/vocab/ingestManifest>)\\s+<${escapeRegExp(persisted.manifestUri)}>`))
    expect(persisted.proposal.text).not.toContain('parserManifest')
    expect(persisted.proposal.text).toMatch(new RegExp(`(?:dcterms:source|<http://purl\\.org/dc/terms/source>)\\s+<${escapeRegExp(sourceUri)}>`))
    expect(persisted.proposal.text).toMatch(/(?:udfs:proposedContent|<https:\/\/undefineds\.co\/vocab\/proposedContent>)/)
    expect(persisted.proposal.text).toContain('# Source Ingest E2E')
    expect(persisted.proposal.text).toContain('Extracted URL body from Playwright route.')
    expect(persisted.proposal.text).toMatch(/(?:udfs:writesCanonicalContent|<https:\/\/undefineds\.co\/vocab\/writesCanonicalContent>)\s+false/)

    routedSourceBody = [
      '<!doctype html>',
      '<html>',
      '<head><title>Source Ingest E2E Refresh</title><meta name="description" content="Ingest source refresh smoke"></head>',
      '<body>',
      '<nav>Refreshed navigation should not be imported</nav>',
      '<main><h1>Source Ingest E2E Refresh</h1><p>Fresh URL body after refresh.</p></main>',
      '<aside>Refreshed aside should not be imported</aside>',
      '</body>',
      '</html>',
    ].join('')
    await workspace.getByRole('button', { name: '刷新来源' }).click()

    let refreshedProposalUri = ''
    await expect.poll(async () => {
      refreshedProposalUri = await page.evaluate(async ({ proposalContainerUri, bodyUri, manifestUri, sourceUri, previousProposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const readText = async (uri: string) => {
          const response = await authFetch(uri)
          return {
            status: response.status,
            text: await response.text(),
          }
        }
        const proposals = await readText(proposalContainerUri)
        const absoluteProposalUris = Array.from(proposals.text.matchAll(/https?:\/\/[^\s<>"']+\.ttl/g))
          .map((match) => match[0])
        const relativeProposalUris = Array.from(proposals.text.matchAll(/<([^>]+\.ttl)>/g))
          .map((match) => new URL(match[1]!, proposalContainerUri).href)
        const proposalUris = Array.from(new Set([...absoluteProposalUris, ...relativeProposalUris]))
          .filter((uri) => uri.includes('/.data/proposals/source/') && uri !== previousProposalUri)
        const proposalResources = await Promise.all(proposalUris.map(async (uri) => ({
          uri,
          resource: await readText(uri),
        })))
        const proposal = proposalResources.find(({ resource }) =>
          resource.status === 200
          && resource.text.includes(`<${bodyUri}>`)
          && resource.text.includes(`<${manifestUri}>`)
          && resource.text.includes(`<${sourceUri}>`)
          && resource.text.includes('Fresh URL body after refresh.')
        )
        return proposal?.uri ?? ''
      }, {
        proposalContainerUri: smoke.proposalContainerUri,
        bodyUri: persisted.bodyUri,
        manifestUri: persisted.manifestUri,
        sourceUri,
        previousProposalUri: persisted.proposalUri,
      })
      return refreshedProposalUri
    }, { timeout: 30_000 }).toContain('/.data/proposals/source/')

    const refreshed = await page.evaluate(async ({ cardUri, bodyUri, manifestUri, proposalUri, previousProposalUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch || !cardUri) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const readText = async (uri: string) => {
        const response = await authFetch(uri)
        return {
          status: response.status,
          text: await response.text(),
        }
      }
      const [card, body, manifest, proposal] = await Promise.all([
        readText(cardUri),
        readText(bodyUri),
        readText(manifestUri),
        readText(proposalUri),
      ])
      const previousProposal = await readText(previousProposalUri)
      return { card, body, manifest, proposalUri, proposal, previousProposalUri, previousProposal }
    }, {
      cardUri,
      bodyUri: persisted.bodyUri,
      manifestUri: persisted.manifestUri,
      proposalUri: refreshedProposalUri,
      previousProposalUri: persisted.proposalUri,
    })

    expect(refreshed.card.status).toBe(200)
    expect(refreshed.card.text).toContain(`<${persisted.bodyUri}>`)
    expect(refreshed.card.text).toContain(`<${persisted.manifestUri}>`)
    expect(refreshed.body.status).toBe(404)
    expect(refreshed.body.text).not.toContain('Fresh URL body after refresh.')
    expect(refreshed.manifest.status).toBe(200)
    expect(refreshed.manifest.text).toMatch(/(?:udfs:SourceIngestManifest|<https:\/\/undefineds\.co\/vocab\/SourceIngestManifest>)/)
    expect(refreshed.manifest.text).toMatch(/(?:udfs:ingestStatus|<https:\/\/undefineds\.co\/vocab\/ingestStatus>)\s+"complete"/)
    expect(refreshed.manifest.text).toMatch(/(?:udfs:totalChunks|<https:\/\/undefineds\.co\/vocab\/totalChunks>)\s+1/)
    expect(refreshed.manifest.text).toMatch(/(?:udfs:writesCanonicalContent|<https:\/\/undefineds\.co\/vocab\/writesCanonicalContent>)\s+false/)
    expect(refreshed.manifest.text).not.toContain('SourceIndexManifest')
    expect(refreshed.manifest.text).not.toContain('parserStatus')
    expect(refreshed.manifest.text).not.toBe(persisted.manifest.text)
    expect(refreshed.proposalUri).not.toBe(persisted.proposalUri)
    expect(refreshed.previousProposal.status).toBe(200)
    expect(refreshed.previousProposal.text).toContain('Extracted URL body from Playwright route.')
    expect(refreshed.previousProposal.text).not.toContain('Fresh URL body after refresh.')
    expect(refreshed.proposal.status).toBe(200)
    expect(refreshed.proposal.text).toMatch(/(?:udfs:SourceUpdateProposal|<https:\/\/undefineds\.co\/vocab\/SourceUpdateProposal>)/)
    expect(refreshed.proposal.text).toContain('Fresh URL body after refresh.')
    expect(refreshed.proposal.text).not.toContain('Extracted URL body from Playwright route.')
    expect(refreshed.proposal.text).not.toContain('Refreshed navigation should not be imported')
    expect(refreshed.proposal.text).not.toContain('Refreshed aside should not be imported')
    expect(refreshed.proposal.text).toMatch(/(?:udfs:writesCanonicalContent|<https:\/\/undefineds\.co\/vocab\/writesCanonicalContent>)\s+false/)
    const refreshedProposalSourceHash = refreshed.proposal.text.match(/(?:udfs:sourceHash|<https:\/\/undefineds\.co\/vocab\/sourceHash>)\s+"([^"]+)"/)?.[1]
    expect(refreshedProposalSourceHash).toBeTruthy()
    expect(refreshed.card.text).not.toMatch(new RegExp(`(?:udfs:sourceHash|<https://undefineds\\.co/vocab/sourceHash>)\\s+"${refreshedProposalSourceHash}"`))

    await openInboxFromBell(page)
    const proposalTarget = inboxApprovalButtonForTarget(page, `${refreshed.proposalUri}#proposal`)
    await expect(proposalTarget).toBeVisible({ timeout: 30_000 })
    await proposalTarget.click()
    await expect(page.getByRole('button', { name: '批准' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '批准' }).click()
    await expect.poll(() =>
      page.evaluate(async ({ proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(proposalUri)
        return response.ok ? await response.text() : ''
      }, { proposalUri: refreshed.proposalUri }),
    { timeout: 30_000 }).toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/)

    const approved = await page.evaluate(async ({ cardUri, bodyUri, manifestUri, proposalUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch || !cardUri) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const readText = async (uri: string) => {
        const response = await authFetch(uri)
        return {
          status: response.status,
          text: await response.text(),
        }
      }
      const [card, body, manifest, proposal] = await Promise.all([
        readText(cardUri),
        readText(bodyUri),
        readText(manifestUri),
        readText(proposalUri),
      ])
      return { card, body, manifest, proposal }
    }, {
      cardUri,
      bodyUri: persisted.bodyUri,
      manifestUri: persisted.manifestUri,
      proposalUri: refreshed.proposalUri,
    })

    expect(approved.card.status).toBe(200)
    expect(approved.card.text).toMatch(/(?:udfs:SourceLinkedCard|<https:\/\/undefineds\.co\/vocab\/SourceLinkedCard>)/)
    expect(approved.card.text).toContain(`<${persisted.bodyUri}>`)
    expect(approved.card.text).toContain(`<${persisted.manifestUri}>`)
    expect(approved.card.text).toMatch(new RegExp(`(?:udfs:sourceHash|<https://undefineds\\.co/vocab/sourceHash>)\\s+"${refreshedProposalSourceHash}"`))
    expect(approved.body.status).toBe(200)
    expect(approved.body.text).toContain('Fresh URL body after refresh.')
    expect(approved.body.text).not.toContain('Refreshed navigation should not be imported')
    expect(approved.body.text).not.toContain('Refreshed aside should not be imported')
    expect(approved.manifest.status).toBe(200)
    expect(approved.manifest.text).toMatch(/(?:udfs:SourceIngestManifest|<https:\/\/undefineds\.co\/vocab\/SourceIngestManifest>)/)
    expect(approved.manifest.text).not.toContain('SourceIndexManifest')
    expect(approved.proposal.status).toBe(200)
    expect(approved.proposal.text).toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/)

  })

  test('keeps local source-linked card edits by rejecting the pending Ingest approval', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const actorWebId = new URL(`${runtime.podName}/profile/card#me`, runtime.baseUrl).href
    const smoke = await page.evaluate(async ({ actorWebId }) => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const { createSourceUpdateProposal, renderSourceUpdateProposalTurtle } = await import('/src/modules/files/source-approval.ts')
      const { createSourceUpdateProposalInboxApproval } = await import('/src/modules/files/source-approval.ts')

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      const stem = `linx-keep-local-${Date.now()}`
      const title = `Keep Local ${Date.now()}`
      const cardUri = new URL(`${stem}.card.ttl`, podUrl).href
      const bodyUri = new URL(`${stem}.md`, podUrl).href
      const sourceUri = new URL(`${stem}.html`, podUrl).href
      const manifestFolder = `.data/ingest/sources/${stem}/`
      const manifestUri = new URL(`${manifestFolder}manifest.ttl`, podUrl).href
      const localBodyText = [
        '# Keep Local',
        '',
        'Local edited body must stay canonical.',
      ].join('\n')
      const sourceHash = `fnv1a-${stem}`
      const pendingSourceHash = `fnv1a-${stem}-fresh`
      const snapshotAt = '2026-06-21T00:00:00.000Z'

      for (const path of [
        'inbox/',
        '.data/',
        '.data/approvals/',
        '.data/audits/',
        '.data/proposals/',
        '.data/proposals/source/',
        '.data/ingest/',
        '.data/ingest/sources/',
        manifestFolder,
      ]) {
        await ensureContainer(path)
      }

      const cardTurtle = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '',
        '<#card> a udfs:SourceLinkedCard ;',
        `  rdfs:label "${title}" ;`,
        `  dcterms:source <${sourceUri}> ;`,
        '  dcterms:format "text/html" ;',
        '  udfs:sourceKind "url" ;',
        `  udfs:sourceHash "${sourceHash}" ;`,
        '  udfs:ingestVersion "url-ingest-v1" ;',
        `  udfs:ingestManifest <${manifestUri}> ;`,
        `  udfs:bodyResource <${bodyUri}> ;`,
        `  dcterms:created "${snapshotAt}" ;`,
        '  udfs:writesCanonicalContent false .',
        '',
      ].join('\n')
      const manifestTurtle = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '',
        '<#manifest> a udfs:SourceIngestManifest ;',
        `  dcterms:source <${sourceUri}> ;`,
        `  udfs:sourceHash "${sourceHash}" ;`,
        '  udfs:ingestVersion "url-ingest-v1" ;',
        '  udfs:ingestStatus "complete" ;',
        '  udfs:readChunks 1 ;',
        '  udfs:totalChunks 1 ;',
        '  udfs:ingestedRange "chunk:1..chunk:1" ;',
        `  udfs:lastIngestedAt "${snapshotAt}" ;`,
        '  udfs:writesCanonicalContent false .',
        '',
      ].join('\n')
      const proposal = createSourceUpdateProposal({
        documentUri: cardUri,
        subject: `${cardUri}#card`,
        targetResourceUri: bodyUri,
        sourceUri,
        sourceIngestManifestUri: manifestUri,
        ingestVersion: 'url-ingest-v2',
        sourceHash: pendingSourceHash,
        operation: 'refresh-card',
        summary: `审阅 ${title} 的来源刷新。`,
        diff: `来源 ${sourceUri} 已变化；Ingest 输出已进入审批。`,
        proposedContent: [
          '<!-- linx-source-block id="chunk:1" hash="fresh" origin="source" -->',
          '# Fresh Ingest',
          '',
          'Fresh Ingest body must not replace local edits.',
        ].join('\n'),
        snapshotAt: '2026-06-21T00:01:00.000Z',
        createdAt: '2026-06-21T00:01:00.000Z',
        podRootUri: podUrl,
      })

      const [cardWrite, bodyWrite, manifestWrite, proposalWrite] = await Promise.all([
        authFetch(cardUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/turtle' },
          body: cardTurtle,
        }),
        authFetch(bodyUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: localBodyText,
        }),
        authFetch(manifestUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/turtle' },
          body: manifestTurtle,
        }),
        authFetch(proposal.proposalResourceUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/turtle' },
          body: renderSourceUpdateProposalTurtle(proposal),
        }),
      ])
      const failedWrite = [cardWrite, bodyWrite, manifestWrite, proposalWrite].find((response) => !response.ok)
      if (failedWrite) {
        throw new Error(`failed to seed Keep Local smoke: ${failedWrite.status} ${await failedWrite.text()}`)
      }

      const approvalUri = await createSourceUpdateProposalInboxApproval(db, {
        actorWebId,
        proposal,
        createdAt: new Date('2026-06-21T00:02:00.000Z'),
      })

      return {
        podUrl,
        stem,
        title,
        cardUri,
        bodyUri,
        localBodyText,
        manifestUri,
        sourceUri,
        sourceHash,
        pendingSourceHash,
        proposalUri: proposal.proposalResourceUri,
        proposalId: proposal.id,
        approvalUri,
      }
    }, { actorWebId })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    const podRootTreeItem = page.getByRole('treeitem', { name: /Pod 根目录/ })
    await expect(podRootTreeItem).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('span'))
      const podRootLabel = labels.find((element) => element.textContent?.includes('Pod 根目录'))
      const clickableRow = podRootLabel?.closest('div.cursor-pointer') as HTMLElement | null
      clickableRow?.click()
    })

    await page.getByPlaceholder('搜索当前范围...').fill(`${smoke.stem}.card.ttl`)
    const cardRow = page.getByLabel('文件列表').getByRole('button', { name: `${smoke.stem}.card.ttl` })
    await expect(cardRow).toBeVisible({ timeout: 30_000 })
    await cardRow.click()

    const workspace = page.getByLabel('文件工作区')
    await expect(workspace.getByRole('heading', { name: smoke.title })).toBeVisible({ timeout: 30_000 })
    await expect(workspace.getByText('Local edited body must stay canonical.')).toBeVisible()
    await workspace.getByRole('button', { name: 'Ingest 与审批' }).click()
    await expect(workspace.getByText('Fresh Ingest body must not replace local edits.')).toBeVisible({ timeout: 30_000 })
    await workspace.getByRole('button', { name: '保留本地编辑' }).click()

    await expect.poll(() =>
      page.evaluate(async ({ proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(proposalUri, { cache: 'no-store' })
        return response.ok ? await response.text() : ''
      }, { proposalUri: smoke.proposalUri }),
    { timeout: 30_000 }).toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"rejected"/)

    const kept = await page.evaluate(async ({ bodyUri, cardUri, manifestUri, proposalUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { inboxOps } = await import('/src/modules/inbox/collections.ts')
      const readText = async (uri: string) => {
        const response = await authFetch(uri, { cache: 'no-store' })
        return {
          status: response.status,
          text: await response.text(),
        }
      }
      const [approvals, body, card, manifest, proposal] = await Promise.all([
        inboxOps.fetchApprovals(),
        readText(bodyUri),
        readText(cardUri),
        readText(manifestUri),
        readText(proposalUri),
      ])
      const approval = approvals.find((item: { target?: string }) => item.target === `${proposalUri}#proposal`) ?? null
      return { approval, body, card, manifest, proposal }
    }, smoke)

    expect(kept.approval).toMatchObject({
      target: `${smoke.proposalUri}#proposal`,
      status: 'rejected',
    })
    expect(kept.body.status).toBe(200)
    expect(kept.body.text).toBe(smoke.localBodyText)
    expect(kept.body.text).not.toContain('Fresh Ingest body must not replace local edits.')
    expect(kept.card.status).toBe(200)
    expect(kept.card.text).toMatch(new RegExp(`(?:udfs:sourceHash|<https://undefineds\\.co/vocab/sourceHash>)\\s+"${escapeRegExp(smoke.sourceHash)}"`))
    expect(kept.card.text).not.toMatch(new RegExp(`(?:udfs:sourceHash|<https://undefineds\\.co/vocab/sourceHash>)\\s+"${escapeRegExp(smoke.pendingSourceHash)}"`))
    expect(kept.card.text).toContain(`<${smoke.bodyUri}>`)
    expect(kept.card.text).toContain(`<${smoke.manifestUri}>`)
    expect(kept.card.text).not.toContain('parserManifest')
    expect(kept.manifest.status).toBe(200)
    expect(kept.manifest.text).toMatch(/(?:udfs:SourceIngestManifest|<https:\/\/undefineds\.co\/vocab\/SourceIngestManifest>)/)
    expect(kept.manifest.text).toMatch(new RegExp(`(?:udfs:sourceHash|<https://undefineds\\.co/vocab/sourceHash>)\\s+"${escapeRegExp(smoke.sourceHash)}"`))
    expect(kept.proposal.status).toBe(200)
    expect(kept.proposal.text).toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"rejected"/)
    expect(kept.proposal.text).toContain('Fresh Ingest body must not replace local edits.')
  })

  test('queues pending Ingest ranges from a source-linked card without rewriting body content', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      const stem = `linx-ingest-queue-${Date.now()}`
      const title = `Pending Ingest Queue ${Date.now()}`
      const cardUri = new URL(`${stem}.card.ttl`, podUrl).href
      const bodyUri = new URL(`${stem}.md`, podUrl).href
      const sourceUri = new URL(`${stem}.pdf`, podUrl).href
      const manifestFolder = `.data/ingest/sources/${stem}/`
      const manifestUri = new URL(`${manifestFolder}manifest.ttl`, podUrl).href
      const bodyText = [
        '# Pending Ingest Queue',
        '',
        'Original approved body stays unchanged while ranges are queued.',
      ].join('\n')
      const snapshotAt = '2026-06-21T00:00:00.000Z'
      const sourceHash = `sha256-${stem}`

      for (const path of [
        '.data/',
        '.data/ingest/',
        '.data/ingest/sources/',
        manifestFolder,
      ]) {
        await ensureContainer(path)
      }

      const sourceBytes = new Uint8Array(12_288)
      for (let index = 0; index < sourceBytes.length; index += 1) {
        sourceBytes[index] = index % 251
      }

      const cardTurtle = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '',
        '<#card> a udfs:SourceLinkedCard ;',
        `  rdfs:label "${title}" ;`,
        `  dcterms:source <${sourceUri}> ;`,
        '  dcterms:format "application/pdf" ;',
        '  udfs:sourceKind "pdf" ;',
        `  udfs:sourceHash "${sourceHash}" ;`,
        '  udfs:ingestVersion "pdf-ingest-v1" ;',
        `  udfs:ingestManifest <${manifestUri}> ;`,
        `  udfs:bodyResource <${bodyUri}> ;`,
        `  dcterms:created "${snapshotAt}" ;`,
        '  udfs:writesCanonicalContent false .',
        '',
      ].join('\n')
      const manifestTurtle = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '',
        '<#manifest> a udfs:SourceIngestManifest ;',
        `  dcterms:source <${sourceUri}> ;`,
        `  udfs:sourceHash "${sourceHash}" ;`,
        '  udfs:ingestVersion "pdf-ingest-v1" ;',
        '  udfs:ingestStatus "partial" ;',
        '  udfs:readChunks 1 ;',
        '  udfs:totalChunks 3 ;',
        '  udfs:ingestedRange "chunk:1..chunk:1" ;',
        '  udfs:pendingRange "bytes:4096..bytes:8191" ;',
        '  udfs:pendingRange "bytes:8192..bytes:12287" ;',
        `  udfs:lastIngestedAt "${snapshotAt}" ;`,
        '  udfs:writesCanonicalContent false .',
        '',
      ].join('\n')

      const [sourceWrite, cardWrite, bodyWrite, manifestWrite] = await Promise.all([
        authFetch(sourceUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: sourceBytes,
        }),
        authFetch(cardUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/turtle' },
          body: cardTurtle,
        }),
        authFetch(bodyUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: bodyText,
        }),
        authFetch(manifestUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/turtle' },
          body: manifestTurtle,
        }),
      ])

      const failedWrite = [sourceWrite, cardWrite, bodyWrite, manifestWrite].find((response) => !response.ok)
      if (failedWrite) {
        throw new Error(`failed to seed source-linked Ingest queue smoke: ${failedWrite.status} ${await failedWrite.text()}`)
      }

      return {
        podUrl,
        stem,
        title,
        cardUri,
        bodyUri,
        bodyText,
        manifestUri,
        firstRange: 'bytes:4096..bytes:8191',
        secondRange: 'bytes:8192..bytes:12287',
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    const podRootTreeItem = page.getByRole('treeitem', { name: /Pod 根目录/ })
    await expect(podRootTreeItem).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('span'))
      const podRootLabel = labels.find((element) => element.textContent?.includes('Pod 根目录'))
      const clickableRow = podRootLabel?.closest('div.cursor-pointer') as HTMLElement | null
      clickableRow?.click()
    })

    await page.getByPlaceholder('搜索当前范围...').fill(`${smoke.stem}.card.ttl`)
    const cardRow = page.getByLabel('文件列表').getByRole('button', { name: `${smoke.stem}.card.ttl` })
    await expect(cardRow).toBeVisible({ timeout: 30_000 })
    await cardRow.click()

    const workspace = page.getByLabel('文件工作区')
    await expect(workspace.getByRole('heading', { name: smoke.title })).toBeVisible({ timeout: 30_000 })
    await expect(workspace.getByText('Original approved body stays unchanged while ranges are queued.')).toBeVisible()
    await workspace.getByRole('button', { name: 'Ingest 与审批' }).click()
    await expect(workspace.getByText(`待 Ingest${smoke.firstRange}, ${smoke.secondRange}`)).toBeVisible({ timeout: 30_000 })

    await workspace.getByRole('button', { name: 'Ingest 下一段' }).click()
    await expect.poll(() =>
      page.evaluate(async ({ manifestUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(manifestUri, { cache: 'no-store' })
        return response.ok ? await response.text() : ''
      }, { manifestUri: smoke.manifestUri }),
    { timeout: 30_000 }).toMatch(/(?:udfs:priorityQueue|<https:\/\/undefineds\.co\/vocab\/priorityQueue>)\s+"bytes:4096\.\.bytes:8191"/)

    const afterNext = await page.evaluate(async ({ bodyUri, manifestUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [bodyResponse, manifestResponse] = await Promise.all([
        authFetch(bodyUri, { cache: 'no-store' }),
        authFetch(manifestUri, { cache: 'no-store' }),
      ])
      return {
        bodyStatus: bodyResponse.status,
        bodyText: await bodyResponse.text(),
        manifestText: await manifestResponse.text(),
      }
    }, smoke)
    expect(afterNext.bodyStatus).toBe(200)
    expect(afterNext.bodyText).toBe(smoke.bodyText)
    expect(afterNext.manifestText).toMatch(vocabStringTriplePattern('priorityQueue', smoke.firstRange))
    expect(afterNext.manifestText).not.toMatch(vocabStringTriplePattern('priorityQueue', smoke.secondRange))
    expect(afterNext.manifestText).not.toContain('parserStatus')
    expect(afterNext.manifestText).not.toContain('SourceIndexManifest')

    await workspace.getByRole('button', { name: 'Ingest 全部' }).click()
    await expect.poll(() =>
      page.evaluate(async ({ manifestUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(manifestUri, { cache: 'no-store' })
        return response.ok ? await response.text() : ''
      }, { manifestUri: smoke.manifestUri }),
    { timeout: 30_000 }).toMatch(/(?:udfs:priorityQueue|<https:\/\/undefineds\.co\/vocab\/priorityQueue>)\s+"bytes:8192\.\.bytes:12287"/)

    const afterAll = await page.evaluate(async ({ bodyUri, manifestUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [bodyResponse, manifestResponse] = await Promise.all([
        authFetch(bodyUri, { cache: 'no-store' }),
        authFetch(manifestUri, { cache: 'no-store' }),
      ])
      return {
        bodyStatus: bodyResponse.status,
        bodyText: await bodyResponse.text(),
        manifestText: await manifestResponse.text(),
      }
    }, smoke)
    expect(afterAll.bodyStatus).toBe(200)
    expect(afterAll.bodyText).toBe(smoke.bodyText)
    expect(afterAll.manifestText).toMatch(vocabStringTriplePattern('priorityQueue', smoke.firstRange))
    expect(afterAll.manifestText).toMatch(vocabStringTriplePattern('priorityQueue', smoke.secondRange))
    expect(afterAll.manifestText).toMatch(/(?:udfs:writesCanonicalContent|<https:\/\/undefineds\.co\/vocab\/writesCanonicalContent>)\s+false/)
    expect(afterAll.manifestText).not.toContain('parserStatus')
    expect(afterAll.manifestText).not.toContain('SourceIndexManifest')
  })

  test('opens a real folder as Finder-style detail with right-side meta', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')

      const folderName = `linx-folder-smoke-${Date.now()}`
      const createFolder = await authFetch(podUrl, {
        method: 'POST',
        headers: {
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: folderName,
        },
      })
      if (![200, 201, 204, 409].includes(createFolder.status)) {
        throw new Error(`failed to create folder ${folderName}: ${createFolder.status} ${await createFolder.text()}`)
      }

      const folderUri = new URL(`${folderName}/`, podUrl).href
      const childUri = new URL('note.md', folderUri).href
      const imageUri = new URL('diagram.png', folderUri).href
      const graphUri = new URL('folder-graph.ttl', folderUri).href
      const metaUri = filesAppMetaResourceUri(folderUri, { currentPodRootUri: podUrl })
      const nestedFolderName = 'nested'
      const nestedFolderUri = new URL(`${nestedFolderName}/`, folderUri).href

      const createNestedFolder = await authFetch(folderUri, {
        method: 'POST',
        headers: {
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: nestedFolderName,
        },
      })
      if (![200, 201, 204, 409].includes(createNestedFolder.status)) {
        throw new Error(`failed to create nested folder: ${createNestedFolder.status} ${await createNestedFolder.text()}`)
      }

      const metaContent = [
        '@prefix udfs: <https://undefineds.co/ns#> .',
        '',
        `  <${folderUri}> udfs:summary "Real folder metadata" .`,
      ].join('\n')

      const [childWrite, imageWrite, graphWrite, metaWrite] = await Promise.all([
        authFetch(childUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: '# Folder child\n\nvisible from folder detail',
        }),
        authFetch(imageUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        }),
        authFetch(graphUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/turtle' },
          body: [
            '@prefix udfs: <https://undefineds.co/vocab/> .',
            '<#FolderGraph> a udfs:FileResource ;',
            '  udfs:title "Folder graph" .',
            '',
          ].join('\n'),
        }),
        authFetch(metaUri, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/sparql-update' },
          body: filesMetaInsertDataPatch(metaUri, metaContent),
        }),
      ])
      if (!childWrite.ok) {
        throw new Error(`failed to write child: ${childWrite.status} ${await childWrite.text()}`)
      }
      if (!imageWrite.ok) {
        throw new Error(`failed to write image child: ${imageWrite.status} ${await imageWrite.text()}`)
      }
      if (!graphWrite.ok) {
        throw new Error(`failed to write ttl child: ${graphWrite.status} ${await graphWrite.text()}`)
      }
      if (!metaWrite.ok) {
        throw new Error(`failed to write folder meta: ${metaWrite.status} ${await metaWrite.text()}`)
      }

      return {
        podUrl,
        folderName,
        folderUri,
        childUri,
        imageUri,
        graphUri,
        metaUri,
        nestedFolderName,
        nestedFolderUri,
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('文件列表')).toBeVisible({ timeout: 30_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.folderName)
    const folderRow = page.getByLabel('文件列表').getByRole('button', { name: smoke.folderName })
    await expect(folderRow).toBeVisible({ timeout: 30_000 })
    await folderRow.click()

    await expect(page.getByLabel('文件工作区').getByText(smoke.folderName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    const initialListView = page.getByLabel('Folder list view')
    await expect(initialListView).toBeVisible()
    await expect(initialListView.getByRole('button', { name: /note\.md/ })).toBeVisible()
    await expect(initialListView.getByRole('button', { name: /diagram\.png/ })).toBeVisible()
    await expect(initialListView.getByRole('button', { name: /folder-graph\.ttl/ })).toBeVisible()
    await expect(initialListView.getByRole('button', { name: smoke.nestedFolderName })).toBeVisible()
    await expect(page.getByText('文件夹预览')).toBeVisible()
    await expect(page.getByRole('dialog', { name: smoke.folderName })).toHaveCount(0)
    await expect(page.getByLabel('文件 meta')).toHaveCount(0)

    await page.getByRole('button', { name: '查看 .meta' }).click()
    const drawer = page.getByLabel('Resource .meta inspector')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(smoke.metaUri)
    await expect(drawer).toContainText('Real folder metadata')
    await expect(drawer).toContainText('inode/container')
    await page.getByRole('button', { name: '关闭 .meta inspector' }).click()
    await expect(page.getByLabel('Resource .meta inspector')).toHaveCount(0)

    await page.getByRole('button', { name: '图标视图' }).click()
    const iconView = page.getByLabel('Folder icon view')
    await expect(iconView).toBeVisible()
    await expect(iconView.getByRole('button', { name: /diagram\.png/ })).toBeVisible()
    await expect(iconView.getByRole('button', { name: /note\.md/ })).toBeVisible()

    await page.getByRole('button', { name: '分栏视图' }).click()
    const columnView = page.getByLabel('Folder column view')
    await expect(columnView).toBeVisible()
    await expect(columnView.getByLabel('Folder column current items')).toBeVisible()
    await columnView.getByRole('button', { name: smoke.nestedFolderName }).click()
    await expect(page.getByLabel(`Folder column ${smoke.nestedFolderName}`)).toBeVisible()
    await expect(page.getByLabel('Folder child preview')).toContainText('双击或打开以进入此文件夹。')

    await page.getByRole('button', { name: '列表视图' }).click()
    const listView = page.getByLabel('Folder list view')
    await expect(listView).toBeVisible()
    await listView.getByRole('button', { name: /note\.md/ }).click()
    const childPreview = page.getByLabel('Folder child preview')
    await expect(childPreview).toContainText('打开后查看和编辑完整内容。')
    await expect(page.getByRole('dialog', { name: 'Folder child' })).toHaveCount(0)
    await childPreview.getByRole('button', { name: '打开选中项' }).click()
    const editorSheet = page.getByRole('dialog', { name: 'Folder child' })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-files-editor-sheet="true"]').filter({ hasText: 'Folder child' })).toBeVisible()
    await expect(editorSheet.getByText('visible from folder detail')).toBeVisible()
    await expect(editorSheet.getByLabel('文件 meta')).toBeVisible()
    await editorSheet.getByRole('button', { name: 'Close' }).click()
    await expect(editorSheet).toBeHidden({ timeout: 10_000 })
    await expect(page.getByLabel('文件工作区').getByText(smoke.folderName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    await listView.getByRole('button', { name: /folder-graph\.ttl/ }).click()
    await expect(childPreview.getByRole('heading', { name: 'folder-graph.ttl' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Table' })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'folder-graph.ttl' })).toHaveCount(0)
    await childPreview.getByRole('button', { name: '打开选中项' }).click()
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('#FolderGraph')).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'folder-graph.ttl' })).toHaveCount(0)

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.folderName)
    const folderRowAfterStructuredChild = page.getByLabel('文件列表').getByRole('button', { name: smoke.folderName })
    await expect(folderRowAfterStructuredChild).toBeVisible({ timeout: 30_000 })
    await folderRowAfterStructuredChild.click()
    await expect(page.getByLabel('文件工作区').getByText(smoke.folderName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    const childFolderName = `child-${Date.now()}`
    const childFolderUri = new URL(`${childFolderName}/`, smoke.folderUri).href
    await page.getByRole('button', { name: '新建文件夹' }).click()
    const createFolderDialog = page.getByRole('dialog', { name: '新建文件夹' })
    await expect(createFolderDialog).toBeVisible()
    const createFolderNameInput = createFolderDialog.getByRole('textbox', { name: '名称' })
    await createFolderNameInput.fill(childFolderName)
    await expect(createFolderNameInput).toHaveValue(childFolderName)
    const submitCreateFolder = createFolderDialog.locator('button[type="submit"]', { hasText: '创建' })
    await expect(submitCreateFolder).toBeEnabled()
    await submitCreateFolder.click()

    await expect.poll(() =>
      page.evaluate(async ({ childFolderUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return 0
        return (await authFetch(childFolderUri)).status
      }, { childFolderUri }),
    { timeout: 30_000 }).toBe(200)
    await expect(page.getByLabel('文件工作区').getByText(childFolderName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('当前容器没有可浏览子项。')).toBeVisible({ timeout: 30_000 })

    const uploadedTextUri = new URL('uploaded-note.md', childFolderUri).href
    const uploadedBinaryUri = new URL('uploaded-image.png', childFolderUri).href
    await page.getByLabel('选择上传文件').setInputFiles([
      {
        name: 'uploaded-note.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Uploaded from folder\n\nreal Pod upload smoke'),
      },
      {
        name: 'uploaded-image.png',
        mimeType: 'image/png',
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      },
    ])

    await expect.poll(() =>
      page.evaluate(async ({ uploadedTextUri, uploadedBinaryUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return 'missing-auth-fetch'
        const [textResponse, binaryResponse] = await Promise.all([
          authFetch(uploadedTextUri),
          authFetch(uploadedBinaryUri),
        ])
        return `${textResponse.status}:${binaryResponse.status}`
      }, { uploadedTextUri, uploadedBinaryUri }),
    { timeout: 30_000 }).toBe('200:200')

    const uploaded = await page.evaluate(async ({ uploadedTextUri, uploadedBinaryUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) throw new Error('Solid DB authenticated fetch is not ready.')
      const [textResponse, binaryResponse] = await Promise.all([
        authFetch(uploadedTextUri),
        authFetch(uploadedBinaryUri),
      ])
      return {
        text: {
          status: textResponse.status,
          contentType: textResponse.headers.get('content-type') ?? '',
          body: await textResponse.text(),
        },
        binary: {
          status: binaryResponse.status,
          contentType: binaryResponse.headers.get('content-type') ?? '',
          bytes: Array.from(new Uint8Array(await binaryResponse.arrayBuffer())),
        },
      }
    }, { uploadedTextUri, uploadedBinaryUri })

    expect(uploaded.text.status).toBe(200)
    expect(uploaded.text.contentType).toContain('text/markdown')
    expect(uploaded.text.body).toContain('real Pod upload smoke')
    expect(uploaded.binary.status).toBe(200)
    expect(uploaded.binary.contentType).toContain('image/png')
    expect(uploaded.binary.bytes).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('creates a markdown file from a real folder detail action', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const folderName = `linx-folder-create-file-${Date.now()}`
      const createFolder = await authFetch(podUrl, {
        method: 'POST',
        headers: {
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: folderName,
        },
      })
      if (![200, 201, 204, 409].includes(createFolder.status)) {
        throw new Error(`failed to create folder ${folderName}: ${createFolder.status} ${await createFolder.text()}`)
      }

      const folderUri = new URL(`${folderName}/`, podUrl).href
      const markdownName = `Created Note ${Date.now()}.md`
      const markdownUri = new URL(markdownName, folderUri).href
      const expectedBody = `# ${markdownName.replace(/\.md$/i, '')}\n`

      return {
        podUrl,
        folderName,
        folderUri,
        markdownName,
        markdownUri,
        expectedBody,
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('文件列表')).toBeVisible({ timeout: 30_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.folderName)
    const folderRow = page.getByLabel('文件列表').getByRole('button', { name: smoke.folderName })
    await expect(folderRow).toBeVisible({ timeout: 30_000 })
    await folderRow.click()

    await expect(page.getByLabel('文件工作区').getByText(smoke.folderName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '新建 Markdown 文件' }).click()
    const createMarkdownDialog = page.getByRole('dialog', { name: '新建 Markdown 文件' })
    await expect(createMarkdownDialog).toBeVisible()
    const fileNameInput = createMarkdownDialog.getByRole('textbox', { name: '文件名' })
    await fileNameInput.fill(smoke.markdownName)
    await expect(fileNameInput).toHaveValue(smoke.markdownName)
    const submitCreateMarkdown = createMarkdownDialog.locator('button[type="submit"]', { hasText: '创建' })
    await expect(submitCreateMarkdown).toBeEnabled()
    await submitCreateMarkdown.click()
    await expect(createMarkdownDialog).toBeHidden({ timeout: 10_000 })

    await expect.poll(() =>
      page.evaluate(async ({ markdownUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return 0
        return (await authFetch(markdownUri)).status
      }, { markdownUri: smoke.markdownUri }),
    { timeout: 30_000 }).toBe(200)

    const created = await page.evaluate(async ({ markdownUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) throw new Error('Solid DB authenticated fetch is not ready.')
      const response = await authFetch(markdownUri)
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        body: await response.text(),
      }
    }, { markdownUri: smoke.markdownUri })

    expect(created.status).toBe(200)
    expect(created.contentType).toContain('text/markdown')
    expect(created.body).toBe(smoke.expectedBody)
    await expect(page.getByLabel('文件工作区').getByText(smoke.markdownName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('shows nested real Pod resources in Recent without making All recursive', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const createContainer = async (containerUri: string, slug: string) => {
        const existing = await authFetch(new URL(slug.endsWith('/') ? slug : `${slug}/`, containerUri).href)
        if (existing.ok) return
        const response = await authFetch(containerUri, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug.replace(/\/$/, ''),
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to create container ${slug}: ${response.status} ${await response.text()}`)
        }
      }

      const folderName = `linx-recent-smoke-${Date.now()}`
      await createContainer(podUrl, folderName)
      const folderUri = new URL(`${folderName}/`, podUrl).href
      await createContainer(folderUri, 'deep')
      const deepFolderUri = new URL('deep/', folderUri).href

      const rootName = 'root-recent.md'
      const deepName = 'deep-recent.json'
      const sidecarName = `${rootName}.meta`
      const rootUri = new URL(rootName, folderUri).href
      const deepUri = new URL(deepName, deepFolderUri).href
      const sidecarUri = new URL(sidecarName, folderUri).href

      const sidecarPatch = [
        `BASE <${sidecarUri}>`,
        'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
        '',
        'INSERT DATA {',
        '  <#meta> rdfs:comment "recent sidecar should be hidden" .',
        '}',
      ].join('\n')
      const resourceWrites = await Promise.all([
        authFetch(rootUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: '# Recent root\n',
        }),
        authFetch(deepUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'recent smoke' }),
        }),
      ])
      const failedResourceWrite = resourceWrites.find((response) => !response.ok)
      if (failedResourceWrite) {
        throw new Error(`failed to seed recent smoke resource: ${failedResourceWrite.status} ${await failedResourceWrite.text()}`)
      }

      const sidecarWrite = await authFetch(sidecarUri, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: sidecarPatch,
      })
      const failedWrite = sidecarWrite.ok ? null : sidecarWrite
      if (failedWrite) {
        throw new Error(`failed to seed recent smoke: ${failedWrite.status} ${await failedWrite.text()}`)
      }

      return {
        podUrl,
        folderName,
        folderUri,
        deepFolderUri,
        folderPath: new URL(folderUri).pathname,
        deepFolderPath: new URL(deepFolderUri).pathname,
        rootName,
        deepName,
        sidecarName,
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    const tree = page.getByRole('tree', { name: '文件分组树' })
    const fileList = page.getByLabel('文件列表')
    const search = page.getByPlaceholder('搜索当前范围...')
    await expect(fileList).toBeVisible({ timeout: 30_000 })

    await tree.getByRole('treeitem', { name: /全部可浏览资源/ }).click()
    await search.fill(smoke.folderName)
    await expect(fileList.getByRole('button', { name: smoke.folderName })).toBeVisible({ timeout: 30_000 })

    await search.fill(smoke.deepName)
    await expect(fileList.getByRole('button', { name: smoke.deepName })).toHaveCount(0)

    await tree.getByRole('treeitem', { name: /最近文件/ }).click()
    await expect(fileList.getByText('最近文件', { exact: true })).toBeVisible()
    await search.fill(smoke.deepName)
    await expect(fileList.getByRole('button', { name: smoke.deepName })).toBeVisible({ timeout: 30_000 })
    await expect(fileList.getByText(smoke.deepFolderPath, { exact: true })).toBeVisible()
    await expect(fileList.getByText('application/json', { exact: true })).toBeVisible()

    await search.fill(smoke.rootName)
    await expect(fileList.getByRole('button', { name: smoke.rootName })).toBeVisible({ timeout: 30_000 })
    await expect(fileList.getByText(smoke.folderPath, { exact: true })).toBeVisible()
    await expect(fileList.getByText('text/markdown', { exact: true })).toBeVisible()
    await expect(fileList.getByRole('button', { name: smoke.sidecarName })).toHaveCount(0)

    const debugState = await readSeededAuthDebugState(page)
    expect(debugState.dbStatus).toBe('ready')
    expect(debugState.dbPodUrl).toBe(smoke.podUrl)
  })

  test('creates and resolves a real access policy proposal according to the Pod policy provider', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      for (const path of [
        'inbox/',
        '.data/',
        '.data/approvals/',
        '.data/audits/',
        '.data/proposals/',
        '.data/proposals/access/',
      ]) {
        await ensureContainer(path)
      }

      const resourceUri = new URL(`linx-access-proposal-${Date.now()}.md`, podUrl).href
      const write = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: '# Access Proposal Smoke\n\nproposal only',
      })
      if (!write.ok) {
        throw new Error(`failed to write access smoke resource: ${write.status} ${await write.text()}`)
      }

      const head = await authFetch(resourceUri, { method: 'HEAD' })
      const linkHeader = head.headers.get('link') ?? ''
      const linkedAcl = linkHeader.match(/<([^>]+)>;\s*rel="acl"/)?.[1]
        ?? linkHeader.match(/<([^>]+)>;\s*rel="http:\/\/www\.w3\.org\/ns\/auth\/acl#accessControl"/)?.[1]
        ?? null
      if (!linkedAcl) {
        throw new Error(`seeded xpod did not expose a linked WAC ACL for ${resourceUri}; Link=${linkHeader}`)
      }

      const aclBefore = await authFetch(linkedAcl)
      const aclBeforeText = aclBefore.ok ? await aclBefore.text() : ''

      return {
        podUrl,
        resourceUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        noteTitle: 'Access Proposal Smoke',
        linkedAcl,
        aclBeforeText,
        proposalContainerUri: new URL('.data/proposals/access/', podUrl).href,
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.getByPlaceholder('搜索当前范围...').fill(smoke.fileName)
    const fileRow = page.getByRole('button', { name: smoke.fileName })
    await expect(fileRow).toBeVisible({ timeout: 30_000 })
    await fileRow.dblclick()

    const editorSheet = page.getByRole('dialog', { name: smoke.noteTitle })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await editorSheet.getByRole('button', { name: '更多文件操作' }).click()
    await page.getByRole('menuitem', { name: '查看 Access 来源' }).click()
    const dialog = page.getByRole('dialog', { name: '权限' })
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toContainText('ACL')
    await expect(dialog).toContainText(smoke.linkedAcl)

    await dialog.getByLabel('访问对象').selectOption('authenticated')
    await dialog.getByLabel('权限级别').selectOption('contributor')
    await dialog.getByLabel('说明').fill('Real Pod access proposal smoke')
    await dialog.getByRole('button', { name: '提交申请' }).click()

    await expect(dialog.getByText('待确认的权限申请', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(dialog.getByRole('button', { name: '提交申请' })).toBeEnabled({ timeout: 30_000 })
    const proposalUriLocator = dialog
      .locator('p')
      .filter({ hasText: /\.data\/proposals\/access\/authenticated-contributor-authenticated-[a-z0-9]{7}\.ttl$/ })
    await expect(proposalUriLocator).toBeVisible({ timeout: 30_000 })
    const proposalUriText = await proposalUriLocator.textContent()
    const proposalUri = proposalUriText?.trim() ?? ''
    expect(proposalUri).toMatch(/\/\.data\/proposals\/access\/authenticated-contributor-authenticated-[a-z0-9]{7}\.ttl$/)
    await expect(dialog.getByText(proposalUri)).toBeVisible()

    const persisted = await page.evaluate(async ({ proposalUri, linkedAcl }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [proposalResponse, aclResponse] = await Promise.all([
        authFetch(proposalUri),
        authFetch(linkedAcl),
      ])
      return {
        proposalStatus: proposalResponse.status,
        proposalText: await proposalResponse.text(),
        aclStatus: aclResponse.status,
        aclText: aclResponse.ok ? await aclResponse.text() : '',
      }
    }, { proposalUri, linkedAcl: smoke.linkedAcl })

    expect(persisted.proposalStatus).toBe(200)
    expect(persisted.proposalText).toMatch(/(?:udfs:AccessPolicyProposal|<https:\/\/undefineds\.co\/vocab\/AccessPolicyProposal>)/)
    expect(persisted.proposalText).toMatch(/(?:udfs:audience|<https:\/\/undefineds\.co\/vocab\/audience>)\s+"authenticated"/)
    expect(persisted.proposalText).toMatch(/(?:udfs:role|<https:\/\/undefineds\.co\/vocab\/role>)\s+"contributor"/)
    expect(persisted.proposalText).toMatch(new RegExp(`(?:udfs:activePolicy|<https://undefineds\\.co/vocab/activePolicy>)\\s+<${smoke.linkedAcl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>`))
    expect(persisted.proposalText).toMatch(/(?:udfs:writesCanonicalPolicy|<https:\/\/undefineds\.co\/vocab\/writesCanonicalPolicy>)\s+false/)
    expect([200, 404]).toContain(persisted.aclStatus)
    expect(persisted.aclText).toBe(smoke.aclBeforeText)
    const policyProviderMatch = persisted.proposalText.match(/(?:udfs:provider|<https:\/\/undefineds\.co\/vocab\/provider>)\s+"(acl|acr)"/)
    const policyProvider = policyProviderMatch?.[1]
    expect(policyProvider).toMatch(/^(acl|acr)$/)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })
    await editorSheet.getByRole('button', { name: 'Close' }).click()
    await expect(editorSheet).toHaveCount(0)

    await openInboxFromBell(page)
    const proposalTarget = inboxApprovalButtonForTarget(page, `${proposalUri}#proposal`)
    await expect(proposalTarget).toBeVisible({ timeout: 30_000 })
    await proposalTarget.click()
    await expect(page.getByRole('heading', { name: 'files.access.proposal' })).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('处理备注').fill(`Approve real Pod ${policyProvider?.toUpperCase()} smoke`)
    await expect(page.getByRole('button', { name: '批准' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '批准' }).click()

    const readProposalText = () =>
      page.evaluate(async ({ proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(proposalUri)
        return response.ok ? await response.text() : ''
      }, { proposalUri })
    const readPolicy = () => page.evaluate(async ({ linkedAcl }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const response = await authFetch(linkedAcl)
      return {
        status: response.status,
        text: response.ok ? await response.text() : '',
      }
    }, { linkedAcl: smoke.linkedAcl })

    if (policyProvider === 'acl') {
      await expect.poll(readProposalText, { timeout: 30_000 })
        .toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/)

      const approved = await readPolicy()
      expect(approved.status).toBe(200)
      expect(approved.text).not.toBe(smoke.aclBeforeText)
      expect(approved.text).toMatch(/(?:AuthenticatedAgent|acl#AuthenticatedAgent)/)
      expect(approved.text).toMatch(/(?:Append|acl#Append)/)
      expect(approved.text).toContain('Real Pod access proposal smoke')
    } else {
      await expect(page.getByText(/ACR access proposal cannot be approved automatically because ACP policy application is not supported yet/))
        .toBeVisible({ timeout: 30_000 })
      await expect.poll(readProposalText, { timeout: 30_000 })
        .toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"pending"/)

      const approved = await readPolicy()
      expect([200, 404]).toContain(approved.status)
      expect(approved.text).toBe(smoke.aclBeforeText)
    }
  })

  test('stages a real .data Turtle cell edit as an approval without changing the canonical resource', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }
      for (const path of [
        'inbox/',
        '.data/',
        '.data/approvals/',
        '.data/audits/',
        '.data/proposals/',
        '.data/proposals/cell/',
      ]) {
        await ensureContainer(path)
      }

      const stem = `state-${Date.now()}`
      const resourceUri = new URL(`.data/${stem}.ttl`, podUrl).href
      const content = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ;',
        '  udfs:title "Files E2E" ;',
        '  udfs:mode "read/write" .',
        '',
      ].join('\n')

      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: content,
      })
      if (!response.ok) {
        throw new Error(`failed to write ${resourceUri}: ${response.status} ${await response.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        proposalContainerUri: new URL('.data/proposals/cell/', podUrl).href,
        subject: `${resourceUri}#Workspace`,
        titlePredicate: 'https://undefineds.co/vocab/title',
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
      }
    })

    const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
    await expect(filesNavButton).toBeVisible()
    await filesNavButton.click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.evaluate(async ({ resourceUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(resourceUri)
    }, smoke)
    await expect(page.getByLabel('文件工作区').getByText(smoke.fileName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('cell', { name: '"Files E2E"' }).click()

    const titleInput = page.getByRole('textbox', { name: new RegExp(`编辑 ${escapeRegExp(smoke.subject)} 的 title`) })
    await expect(titleInput).toBeVisible()
    await titleInput.fill('Draft title')
    await titleInput.blur()

    const approvalStatus = page.getByRole('status', { name: `Pending approval for title on ${smoke.subject}` })
    try {
      await expect(approvalStatus).toBeVisible({ timeout: 30_000 })
    } catch (error) {
      const diagnostic = await page.evaluate(async ({ proposalContainerUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { error: 'Solid DB authenticated fetch is not ready.' }
        const response = await authFetch(proposalContainerUri)
        return {
          proposalContainerStatus: response.status,
          proposalContainerText: await response.text(),
        }
      }, smoke)
      const discardTitle = await page
        .getByRole('button', { name: `Discard pending write for title on ${smoke.subject}` })
        .getAttribute('title')
        .catch(() => null)
      throw new Error(`structured cell approval was not staged: ${JSON.stringify({ discardTitle, diagnostic })}`, { cause: error })
    }
    await expect(page.getByText('"Draft title"')).toBeVisible()

    const structuredProposalInput = {
      resourceUri: smoke.resourceUri,
      subject: smoke.subject,
      includes: [smoke.titlePredicate, 'Draft title'],
      proposalContainerUri: smoke.proposalContainerUri,
    }
    await expect.poll(async () => {
      const current = await readStructuredCellProposalFromCollection(page, structuredProposalInput)
      return {
        found: current.found,
        proposalStatus: current.proposalStatus,
        resourceStatus: current.resourceStatus,
      }
    }, { timeout: 30_000 }).toEqual({
      found: true,
      proposalStatus: 200,
      resourceStatus: 200,
    })
    const persisted = await readStructuredCellProposalFromCollection(page, structuredProposalInput)
    if (!persisted.found || !persisted.proposalUri) {
      throw new Error(`structured cell proposal not found through Files proposal collection.\nContainer diagnostic:\n${persisted.proposalContainerText}\nCandidates:\n${persisted.candidateSummary}`)
    }

    expect(persisted.resourceStatus).toBe(200)
    expect(persisted.resourceText).toContain('"Files E2E"')
    expect(persisted.resourceText).not.toContain('Draft title')
    expect(persisted.proposalStatus).toBe(200)
    expect(persisted.proposal).toMatchObject({
      kind: 'structured-cell-change-proposal',
      documentUri: smoke.resourceUri,
      subject: smoke.subject,
      predicate: smoke.titlePredicate,
      status: 'pending',
      writesCanonicalResource: false,
    })
    expect(persisted.proposalText).toContain('Draft title')

    await openInboxFromBell(page)
    const proposalTarget = inboxApprovalButtonForTarget(page, `${persisted.proposalUri}#proposal`)
    await expect(proposalTarget).toBeVisible({ timeout: 30_000 })
    await proposalTarget.click()
    await expect(page.getByRole('button', { name: '批准' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '批准' }).click()

    await expect.poll(() =>
      page.evaluate(async ({ resourceUri, proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { resourceText: '', proposalText: '' }
        const [resourceResponse, proposalResponse] = await Promise.all([
          authFetch(resourceUri),
          authFetch(proposalUri),
        ])
        return {
          resourceText: resourceResponse.ok ? await resourceResponse.text() : '',
          proposalText: proposalResponse.ok ? await proposalResponse.text() : '',
        }
      }, { resourceUri: smoke.resourceUri, proposalUri: persisted.proposalUri }),
    { timeout: 30_000 }).toMatchObject({
      resourceText: expect.stringContaining('Draft title'),
      proposalText: expect.stringMatching(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/),
    })
    const approved = await page.evaluate(async ({ resourceUri, proposalUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [resourceResponse, proposalResponse] = await Promise.all([
        authFetch(resourceUri),
        authFetch(proposalUri),
      ])
      return {
        resourceText: await resourceResponse.text(),
        proposalText: await proposalResponse.text(),
      }
    }, { resourceUri: smoke.resourceUri, proposalUri: persisted.proposalUri })
    expect(approved.resourceText).not.toContain('"Files E2E"')
    expect(approved.proposalText).toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/)
  })

  test('moves a real .data Kanban card through Inbox approval before mutating canonical Turtle', async ({ page }) => {
    test.setTimeout(150_000)
    await loginToSeededXpod(page, runtime)

    const smoke = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }
      for (const path of [
        'inbox/',
        '.data/',
        '.data/approvals/',
        '.data/audits/',
        '.data/proposals/',
        '.data/proposals/cell/',
      ]) {
        await ensureContainer(path)
      }

      const stem = `kanban-${Date.now()}`
      const resourceUri = new URL(`.data/${stem}.ttl`, podUrl).href
      const modePredicate = 'https://undefineds.co/vocab/mode'
      const content = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '',
        '<#Ready> a udfs:Workspace ;',
        '  rdfs:label "Ready card" ;',
        `  <${modePredicate}> "ready" .`,
        '',
        '<#Mover> a udfs:Workspace ;',
        '  rdfs:label "Mover card" ;',
        `  <${modePredicate}> "queue" .`,
        '',
      ].join('\n')

      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: content,
      })
      if (!response.ok) {
        throw new Error(`failed to write ${resourceUri}: ${response.status} ${await response.text()}`)
      }

      return {
        podUrl,
        resourceUri,
        proposalContainerUri: new URL('.data/proposals/cell/', podUrl).href,
        moverSubject: `${resourceUri}#Mover`,
        modePredicate,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
      }
    })

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })

    await page.evaluate(async ({ resourceUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(resourceUri)
    }, smoke)
    await expect(page.getByLabel('文件工作区').getByText(smoke.fileName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '+ 视图' }).click()
    await page.getByRole('menuitem', { name: 'Kanban' }).click()
    await page.getByRole('button', { name: 'Kanban 分组 predicate' }).click()
    await page.getByRole('menuitem', { name: 'mode' }).click()
    await expect(page.getByText('Mover card')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: `Move ${smoke.moverSubject}` }).press('Enter')
    await page.getByRole('menuitem', { name: '移动到 ready' }).press('Enter')
    await expect(page.getByText(/待审批：.*ready/)).toBeVisible({ timeout: 30_000 })

    const structuredProposalInput = {
      resourceUri: smoke.resourceUri,
      subject: smoke.moverSubject,
      includes: [smoke.modePredicate, 'queue', 'ready'],
      proposalContainerUri: smoke.proposalContainerUri,
    }
    await expect.poll(async () => {
      const current = await readStructuredCellProposalFromCollection(page, structuredProposalInput)
      return {
        found: current.found,
        proposalStatus: current.proposalStatus,
        resourceStatus: current.resourceStatus,
      }
    }, { timeout: 30_000 }).toEqual({
      found: true,
      proposalStatus: 200,
      resourceStatus: 200,
    })
    const persisted = await readStructuredCellProposalFromCollection(page, structuredProposalInput)
    if (!persisted.found || !persisted.proposalUri) {
      throw new Error(`Kanban structured cell proposal not found through Files proposal collection.\nContainer diagnostic:\n${persisted.proposalContainerText}\nCandidates:\n${persisted.candidateSummary}`)
    }

    expect(persisted.resourceStatus).toBe(200)
    expect(persisted.resourceText).toContain('"queue"')
    expect(persisted.resourceText).toContain('"ready"')
    expect(persisted.proposalStatus).toBe(200)
    expect(persisted.proposal).toMatchObject({
      kind: 'structured-cell-change-proposal',
      documentUri: smoke.resourceUri,
      subject: smoke.moverSubject,
      predicate: smoke.modePredicate,
      status: 'pending',
      writesCanonicalResource: false,
    })
    expect(persisted.proposalText).toContain('queue')
    expect(persisted.proposalText).toContain('ready')

    await openInboxFromBell(page)
    const proposalTarget = inboxApprovalButtonForTarget(page, `${persisted.proposalUri}#proposal`)
    await expect(proposalTarget).toBeVisible({ timeout: 30_000 })
    await proposalTarget.click()
    await expect(page.getByRole('button', { name: '批准' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '批准' }).click()

    await expect.poll(() =>
      page.evaluate(async ({ resourceUri, proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return { resourceText: '', proposalText: '' }
        const [resourceResponse, proposalResponse] = await Promise.all([
          authFetch(resourceUri),
          authFetch(proposalUri),
        ])
        return {
          resourceText: resourceResponse.ok ? await resourceResponse.text() : '',
          proposalText: proposalResponse.ok ? await proposalResponse.text() : '',
        }
      }, { resourceUri: smoke.resourceUri, proposalUri: persisted.proposalUri }),
    { timeout: 30_000 }).toMatchObject({
      resourceText: expect.not.stringContaining('"queue"'),
      proposalText: expect.stringMatching(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/),
    })
    const approved = await page.evaluate(async ({ resourceUri, proposalUri }) => {
      const db = (window as any).__SOLID_DB__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }
      const [resourceResponse, proposalResponse] = await Promise.all([
        authFetch(resourceUri),
        authFetch(proposalUri),
      ])
      return {
        resourceText: await resourceResponse.text(),
        proposalText: await proposalResponse.text(),
      }
    }, { resourceUri: smoke.resourceUri, proposalUri: persisted.proposalUri })
    expect(approved.resourceText).toContain('"ready"')
    expect(approved.resourceText).not.toContain('"queue"')
    expect(approved.proposalText).toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/)
  })

  test('approves a real .data predicate proposal and bootstraps .vocab registries', async ({ page }) => {
    test.setTimeout(180_000)
    await loginToSeededXpod(page, runtime)

    const actorWebId = new URL(`${runtime.podName}/profile/card#me`, runtime.baseUrl).href

    const smoke = await page.evaluate(async ({ actorWebId }) => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      if (!podUrl || !authFetch) {
        throw new Error('Solid DB authenticated fetch is not ready.')
      }

      const ensureContainer = async (path: string) => {
        const normalizedPath = path.endsWith('/') ? path : `${path}/`
        const uri = new URL(normalizedPath, podUrl).href
        const existing = await authFetch(uri)
        if (existing.ok) return

        const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
        const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
        const response = await authFetch(new URL(parentPath, podUrl).href, {
          method: 'POST',
          headers: {
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            Slug: slug,
          },
        })
        if (![200, 201, 204, 409].includes(response.status)) {
          throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
        }
      }

      for (const path of [
        'inbox/',
        '.data/',
        '.data/approvals/',
        '.data/audits/',
        '.data/proposals/',
        '.data/proposals/vocab/',
      ]) {
        await ensureContainer(path)
      }

      const stem = `vocab-bootstrap-${Date.now()}`
      const resourceUri = new URL(`.data/${stem}.ttl`, podUrl).href
      const termLocalName = `summary-${Date.now()}`
      const termUri = new URL(`.vocab/terms.ttl#${termLocalName}`, podUrl).href
      const content = [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ;',
        '  udfs:title "Files Vocab Bootstrap" ;',
        '  udfs:mode "read/write" .',
        '',
      ].join('\n')

      const response = await authFetch(resourceUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: content,
      })
      if (!response.ok) {
        throw new Error(`failed to write ${resourceUri}: ${response.status} ${await response.text()}`)
      }

      const { createRawTextResource } = await import('/src/modules/files/browser.ts')
      const {
        createVocabTermProposal,
        renderVocabTermProposalTurtle,
      } = await import('/src/modules/files/structured-table.ts')
      const { createVocabTermProposalInboxApproval } = await import('/src/modules/files/vocab-approval.ts')
      const proposal = createVocabTermProposal({
        documentUri: resourceUri,
        classScope: 'udfs:Workspace',
        termUri,
        termKind: 'predicate',
        label: termLocalName,
        valueType: 'text',
        description: 'Short note summary shown on cards.',
        shape: 'minCount 0 · maxCount 1',
      })
      await createRawTextResource(db, {
        uri: proposal.proposalResourceUri,
        mimeType: 'text/turtle',
      }, renderVocabTermProposalTurtle(proposal))
      const proposalResponse = await authFetch(proposal.proposalResourceUri)
      const proposalText = await proposalResponse.text()
      await createVocabTermProposalInboxApproval(db, { actorWebId, proposal })

      return {
        podUrl,
        resourceUri,
        fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
        termUri,
        termsUri: new URL('.vocab/terms.ttl', podUrl).href,
        shapesUri: new URL('.vocab/shapes.ttl', podUrl).href,
        namespacesUri: new URL('.vocab/namespaces.ttl', podUrl).href,
        proposalUri: proposal.proposalResourceUri,
        proposalText,
      }
    }, { actorWebId })

    expect(smoke.proposalText).toContain('<https://undefineds.co/vocab/termKind> "predicate"')
    expect(smoke.proposalText).toContain(`<https://undefineds.co/vocab/term> <${smoke.termUri}>`)

    await expect.poll(async () => {
      return page.evaluate(async ({ proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return 0
        const response = await authFetch(proposalUri)
        return response.status
      }, smoke)
    }, { timeout: 30_000 }).toBe(200)

    await invalidateInboxQueries(page)
    await openInboxFromBell(page)
    const proposalTarget = inboxApprovalButtonForTarget(page, `${smoke.proposalUri}#proposal`)
    await expect(proposalTarget).toBeVisible({ timeout: 30_000 })
    await proposalTarget.click()
    await expect(page.getByRole('heading', { name: 'files.vocab.proposal' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: '批准' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '批准' }).click()
    await expect.poll(async () => {
      return page.evaluate(async ({ proposalUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) return ''
        const response = await authFetch(proposalUri)
        return response.ok ? await response.text() : ''
      }, smoke)
    }, { timeout: 30_000 }).toMatch(/(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"approved"/)

    const readPersisted = () =>
      page.evaluate(async ({ resourceUri, termsUri, shapesUri, namespacesUri }) => {
        const db = (window as any).__SOLID_DB__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        if (!authFetch) {
          throw new Error('Solid DB authenticated fetch is not ready.')
        }
        const readText = async (uri: string) => {
          const response = await authFetch(uri)
          return {
            status: response.status,
            text: await response.text(),
          }
        }
        const [resource, terms, shapes, namespaces] = await Promise.all([
          readText(resourceUri),
          readText(termsUri),
          readText(shapesUri),
          readText(namespacesUri),
        ])
        return { resource, terms, shapes, namespaces }
      }, smoke)

    await expect.poll(async () => {
      const current = await readPersisted().catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
        namespaces: { status: 0, text: '' },
        resource: { status: 0, text: '' },
        shapes: { status: 0, text: '' },
        terms: { status: 0, text: '' },
      }))
      return {
        namespacesStatus: current.namespaces.status,
        shapesHasRule: current.shapes.text.includes('minCount 0 · maxCount 1'),
        shapesStatus: current.shapes.status,
        termsHasTerm: current.terms.text.includes(`<${smoke.termUri}>`),
        termsStatus: current.terms.status,
      }
    }, { timeout: 30_000 }).toEqual({
      namespacesStatus: 200,
      shapesHasRule: true,
      shapesStatus: 200,
      termsHasTerm: true,
      termsStatus: 200,
    })
    const persisted = await readPersisted()

    expect(persisted.resource.status).toBe(200)
    expect(persisted.resource.text).toContain('"Files Vocab Bootstrap"')
    expect(persisted.resource.text).not.toContain('PredicateTerm')
    expect(persisted.terms.status).toBe(200)
    expect(persisted.terms.text).toMatch(/(?:udfs:VocabTermRegistry|<https:\/\/undefineds\.co\/vocab\/VocabTermRegistry>)/)
    expect(persisted.terms.text).toContain(`<${smoke.termUri}>`)
    expect(persisted.terms.text).toMatch(/(?:udfs:PredicateTerm|<https:\/\/undefineds\.co\/vocab\/PredicateTerm>)/)
    expect(persisted.shapes.status).toBe(200)
    expect(persisted.shapes.text).toMatch(/(?:udfs:VocabShapeRegistry|<https:\/\/undefineds\.co\/vocab\/VocabShapeRegistry>)/)
    expect(persisted.shapes.text).toContain('minCount 0 · maxCount 1')
    expect(persisted.namespaces.status).toBe(200)
    expect(persisted.namespaces.text).toMatch(/(?:udfs:VocabNamespaceRegistry|<https:\/\/undefineds\.co\/vocab\/VocabNamespaceRegistry>)/)

    await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
    await page.evaluate(async ({ termsUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(termsUri)
    }, smoke)
    await expect(page.getByText('词表定义表')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('定义表只读；修改通过待确认提案进入审批。')).toBeVisible()
    await expect(page.getByText('只读', { exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '术语 URI' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '类型', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '值类型' })).toBeVisible()
    await expect(page.getByRole('cell', { name: smoke.termUri })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ 字段' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Subject' })).toHaveCount(0)

    await page.evaluate(async ({ shapesUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(shapesUri)
    }, smoke)
    await expect(page.getByText('Shape 规则表')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('定义表只读；修改通过待确认提案进入审批。')).toBeVisible()
    await expect(page.getByText('只读', { exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'term' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'class' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '约束' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'minCount 0 · maxCount 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ 字段' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Subject' })).toHaveCount(0)

    await page.evaluate(async ({ namespacesUri }) => {
      const { useFilesStore } = await import('/src/modules/files/store.ts')
      useFilesStore.getState().selectFile(namespacesUri)
    }, smoke)
    await expect(page.getByText('命名空间表')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('定义表只读；修改通过待确认提案进入审批。')).toBeVisible()
    await expect(page.getByText('只读', { exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '前缀' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '命名空间' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '说明' })).toBeVisible()
    await expect(page.getByRole('row', { name: /udfs\s+https:\/\/undefineds\.co\/vocab\// })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ 字段' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Subject' })).toHaveCount(0)
  })
})
