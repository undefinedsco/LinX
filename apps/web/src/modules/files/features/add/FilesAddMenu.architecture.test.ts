import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const viewPath = 'src/modules/files/features/add/FilesAddMenu.tsx'
const controllerPath = 'src/modules/files/features/add/useFilesAddMenuController.ts'
const modelPath = 'src/modules/files/domain/list/files-add-menu-model.ts'

describe('Files add menu architecture', () => {
  it('keeps pure chrome, business orchestration, and data-free planning in separate owners', () => {
    expect(existsSync(viewPath)).toBe(true)
    expect(existsSync(controllerPath)).toBe(true)
    expect(existsSync(modelPath)).toBe(true)

    const viewSource = readFileSync(viewPath, 'utf8')
    const controllerSource = readFileSync(controllerPath, 'utf8')
    const modelSource = readFileSync(modelPath, 'utf8')

    expect(viewSource).toContain("from './useFilesAddMenuController'")
    expect(viewSource).not.toContain("from '../../data/queries'")
    expect(viewSource).not.toContain('useFilesStore')
    expect(viewSource).not.toContain('mutateAsync')

    expect(controllerSource).toContain("from '../../data/queries'")
    expect(controllerSource).toContain('useFilesStore')
    expect(controllerSource).toContain('projectFilesAddMenuModel')
    expect(controllerSource).toContain('useFolderDetailUploadController')
    expect(controllerSource).toContain('useSourceIngestToolbarController')
    expect(controllerSource).not.toContain('<DropdownMenu')
    expect(controllerSource).not.toContain('<Dialog')

    expect(modelSource).toContain('export function projectFilesAddMenuModel')
    expect(modelSource).toContain('export function projectFilesAddContainerUri')
    expect(modelSource).not.toContain('react')
    expect(modelSource).not.toContain('useFilesStore')
    expect(modelSource).not.toContain('mutateAsync')
  })
})
