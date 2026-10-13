import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }))

const WEB_ID = 'https://id.undefineds.co/linzhou/profile/card#me'
const editorState = vi.hoisted(() => ({
  value: null as any,
}))
const saveField = vi.fn().mockResolvedValue(undefined)
const changeAvatar = vi.fn()
const retry = vi.fn()
const revertChange = vi.fn()

vi.mock('./useProfileEditor', () => ({ useProfileEditor: () => editorState.value }))
vi.mock('./useSpaceStatus', () => ({ useSpaceStatus: () => ({ spaceLabel: '云端' }) }))

import { useCardDialog } from '@/lib/card-dialog'
import { ProfileEditorPage } from './ProfileEditorPage'

function makeEditor(overrides: Record<string, unknown> = {}) {
  return {
    webId: WEB_ID,
    authFetch: vi.fn(),
    values: { name: '林舟', nick: '舟舟', note: '周末在书店做读书会', region: '', gender: '', email: '', phone: '', avatar: '' },
    isLoading: false,
    loadFailed: false,
    reload: vi.fn(),
    status: { kind: 'idle' },
    online: true,
    avatarPreview: null,
    saveField,
    changeAvatar,
    retry,
    revertChange,
    ...overrides,
  }
}

describe('ProfileEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    editorState.value = makeEditor()
    useCardDialog.setState({ request: null })
  })

  it('says the card is public and shows a live preview of what others see', () => {
    render(<ProfileEditorPage theme="light" />)

    expect(screen.getAllByText('所有人可见')).toHaveLength(2)
    const preview = screen.getByTestId('profile-contact-preview')
    expect(preview).toHaveTextContent('林舟')
    expect(preview).toHaveTextContent('昵称：舟舟')
    expect(preview).toHaveTextContent('linzhou@undefineds.co')
    expect(preview).toHaveTextContent('周末在书店做读书会')
    // The raw WebID is never shown.
    expect(screen.queryByText(WEB_ID)).toBeNull()
  })

  it('edits a row in place, follows it in the preview, and saves on Enter', () => {
    render(<ProfileEditorPage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '昵称，舟舟' }))
    const input = screen.getByLabelText('昵称')
    fireEvent.change(input, { target: { value: '小舟' } })
    expect(screen.getByTestId('profile-contact-preview')).toHaveTextContent('昵称：小舟')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(saveField).toHaveBeenCalledTimes(1)
    expect(saveField).toHaveBeenCalledWith('nick', '小舟')
  })

  it('saves when focus leaves the row, and only once', () => {
    render(<ProfileEditorPage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '签名，周末在书店做读书会' }))
    const input = screen.getByLabelText('签名')
    expect(screen.getByText('9 / 60')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '新的签名' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(saveField).toHaveBeenCalledTimes(1)
    expect(saveField).toHaveBeenCalledWith('note', '新的签名')
  })

  it('drops the change on Esc', () => {
    render(<ProfileEditorPage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '名字，林舟' }))
    const input = screen.getByLabelText('名字')
    fireEvent.change(input, { target: { value: '别人' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect(saveField).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '名字，林舟' })).toBeInTheDocument()
  })

  it('picks gender from a list and saves immediately', () => {
    render(<ProfileEditorPage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '性别，不填' }))
    fireEvent.change(screen.getByLabelText('性别'), { target: { value: 'female' } })

    expect(saveField).toHaveBeenCalledWith('gender', 'female')
  })

  it('opens profile/card as a card from 在文件里打开', () => {
    render(<ProfileEditorPage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '在文件里打开' }))
    expect(useCardDialog.getState().request).toMatchObject({
      uri: 'https://id.undefineds.co/linzhou/profile/card',
    })
  })

  it.each([
    [{ kind: 'saving' }, '正在保存…', 'status'],
    [{ kind: 'failed', field: 'note' }, '签名没保存成功，改动还在', 'alert'],
    [{ kind: 'avatar-too-large' }, '头像太大了（上限 5 MB）', 'alert'],
    [{ kind: 'offline' }, '没有网络，恢复后自动保存', 'status'],
    [{ kind: 'changed-elsewhere', field: 'nick', previous: '舟舟' }, '别的应用刚改了你的昵称，已换成最新的', 'status'],
  ])('shows one line in the page for %j', (status, text, role) => {
    editorState.value = makeEditor({ status })
    render(<ProfileEditorPage theme="light" />)

    expect(screen.getByRole(role as 'status' | 'alert')).toHaveTextContent(text)
  })

  it('retries a failed save and can put back a value changed elsewhere', () => {
    editorState.value = makeEditor({ status: { kind: 'failed', field: 'note' } })
    const { unmount } = render(<ProfileEditorPage theme="light" />)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalled()
    unmount()

    editorState.value = makeEditor({ status: { kind: 'changed-elsewhere', field: 'nick', previous: '舟舟' } })
    render(<ProfileEditorPage theme="light" />)
    fireEvent.click(screen.getByRole('button', { name: '改回去' }))
    expect(revertChange).toHaveBeenCalled()
  })

  it('copies the full account address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ProfileEditorPage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '复制地址' }))
    expect(writeText).toHaveBeenCalledWith(WEB_ID)
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument()
  })
})
