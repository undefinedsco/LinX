import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const podAdapterPath = 'src/modules/files/data/pod-adapter/index.ts'
const browserShimPath = 'src/modules/files/browser.ts'
const resourceSemanticsPath = 'src/modules/files/domain/resource/resource-semantics.ts'
const metaSidecarTransferModelPath = 'src/modules/files/domain/sidecar/meta-sidecar-transfer-model.ts'
const rootMetaSidecarTransferShimPath = 'src/modules/files/meta-sidecar-transfer-model.ts'

describe('Files browser architecture boundary', () => {
  it('keeps the legacy browser module as a compatibility shim', () => {
    const browserShimSource = readFileSync(browserShimPath, 'utf8')

    expect(browserShimSource).toMatch(/^export \* from '.\/data\/pod-adapter'\n?$/)
  })

  it('keeps pure resource semantics out of the Pod browser adapter', () => {
    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')

    expect(existsSync(resourceSemanticsPath)).toBe(true)
    if (!existsSync(resourceSemanticsPath)) return

    const semanticsSource = readFileSync(resourceSemanticsPath, 'utf8')

    expect(podAdapterSource).toContain("from '../../domain/resource/resource-semantics'")
    expect(podAdapterSource).toContain('export {')
    expect(podAdapterSource).not.toMatch(/export function classifyFilesEntry\b/)
    expect(podAdapterSource).not.toMatch(/export function getFilesEntryOpenMode\b/)
    expect(podAdapterSource).not.toMatch(/export function getFilesEntrySemanticLabel\b/)
    expect(podAdapterSource).not.toMatch(/export function getFilesOpenModeLabel\b/)
    expect(podAdapterSource).not.toMatch(/export function getFilesResourceActions\b/)
    expect(podAdapterSource).not.toMatch(/export function getEntryName\b/)
    expect(podAdapterSource).not.toMatch(/export function getParentContainerUri\b/)
    expect(podAdapterSource).not.toMatch(/export function normalizeContainerUri\b/)
    expect(podAdapterSource).not.toMatch(/function isTextLikeMimeType\b/)
    expect(podAdapterSource).not.toMatch(/export function resolveFilesSidecarPlacement\b/)
    expect(podAdapterSource).not.toMatch(/export function resolveFilesResourceSidecars\b/)
    expect(podAdapterSource).not.toMatch(/export function resolveFilesSidecarOwnerTarget\b/)

    expect(semanticsSource).toContain('export function classifyFilesEntry')
    expect(semanticsSource).not.toContain('@inrupt/solid-client')
    expect(semanticsSource).not.toContain('@tanstack/react-query')
    expect(semanticsSource).not.toContain('SolidDatabase')
    expect(semanticsSource).not.toContain('projectStructuredResourceTable')
    expect(semanticsSource).not.toContain('@/providers/query-provider')
  })

  it('keeps meta sidecar RDF rewrite rules out of the Pod browser adapter', () => {
    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')

    expect(existsSync(metaSidecarTransferModelPath)).toBe(true)
    expect(existsSync(rootMetaSidecarTransferShimPath)).toBe(true)
    if (!existsSync(metaSidecarTransferModelPath) || !existsSync(rootMetaSidecarTransferShimPath)) return

    const metaTransferSource = readFileSync(metaSidecarTransferModelPath, 'utf8')
    const rootShimSource = readFileSync(rootMetaSidecarTransferShimPath, 'utf8')

    expect(podAdapterSource).toContain("from '../../domain/sidecar/meta-sidecar-transfer-model'")
    expect(podAdapterSource).not.toMatch(/\nfunction replaceOwnerSubject\(/)
    expect(podAdapterSource).not.toMatch(/\nfunction replaceOwnerValue\(/)
    expect(podAdapterSource).not.toMatch(/\nfunction renderCopyableMetaTriples\(/)
    expect(podAdapterSource).not.toMatch(/\nfunction buildMetaSidecarCopyPatch\(/)
    expect(podAdapterSource).not.toMatch(/\nfunction isSystemMetaPredicate\(/)

    expect(metaTransferSource).toContain('export function buildMetaSidecarCopyPatch')
    expect(metaTransferSource).toContain('export function renderCopyableMetaTriples')
    expect(metaTransferSource).toContain("from '../resource/resource-semantics'")
    expect(metaTransferSource).toContain("from '../structured/structured-table'")
    expect(metaTransferSource).not.toContain('SolidDatabase')
    expect(metaTransferSource).not.toContain('getAuthenticatedFetch')
    expect(metaTransferSource).not.toContain('method: ')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/sidecar\/meta-sidecar-transfer-model'\n?$/)
  })
})
