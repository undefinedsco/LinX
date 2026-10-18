import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('./useSettingsNavigationHints', () => ({
  useSettingsNavigationHints: () => ({ runtime: '运行中', network: '未开启', updates: '新版本' }),
}))

import { SettingsListPane } from './SettingsListPane'
import { useSettingsStore } from '../../app/store'

describe('SettingsListPane', () => {
  beforeEach(() => {
    useSettingsStore.setState({ selectedSection: 'general' })
  })

  it('lists the S7 groups with the renamed sections', () => {
    render(<SettingsListPane theme="dark" />)

    for (const title of ['空间与服务', '通用', '模型连接', '本机服务', '外部访问', '版本更新', '关于 LinX']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
    expect(screen.queryByText('运行环境')).not.toBeInTheDocument()
    expect(screen.queryByText('本地网络')).not.toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByText('新版本')).toBeInTheDocument()
  })

  it('updates the selected section when clicked', () => {
    render(<SettingsListPane theme="dark" />)

    fireEvent.click(screen.getByText('本机服务'))
    expect(useSettingsStore.getState().selectedSection).toBe('runtime')

    fireEvent.click(screen.getByText('外部访问'))
    expect(useSettingsStore.getState().selectedSection).toBe('network')
  })
})
