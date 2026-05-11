import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsListPane } from './SettingsListPane'
import { useSettingsStore } from '../store'

describe('SettingsListPane', () => {
  beforeEach(() => {
    useSettingsStore.setState({ selectedSection: 'general' })
  })

  it('renders the available settings sections', () => {
    render(<SettingsListPane theme="dark" />)

    expect(screen.getByText('通用')).toBeInTheDocument()
    expect(screen.getByText('版本更新')).toBeInTheDocument()
    expect(screen.getByText('运行环境')).toBeInTheDocument()
  })

  it('updates the selected section when clicked', () => {
    render(<SettingsListPane theme="dark" />)

    fireEvent.click(screen.getByText('运行环境'))

    expect(useSettingsStore.getState().selectedSection).toBe('runtime')
  })
})
