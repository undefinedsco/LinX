import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ModelProviderList } from './ModelProviderList'

const items = [
  { id: 'alpha', name: 'Alpha', enabled: true },
  { id: 'beta', name: 'Beta', enabled: false },
  { id: 'gamma', name: 'Gamma', enabled: false },
]

function ProviderListHarness() {
  const [selectedId, setSelectedId] = useState('alpha')
  return <ModelProviderList items={items} selectedId={selectedId} onSelect={setSelectedId} />
}

describe('ModelProviderList keyboard accessibility', () => {
  it('moves focus and selection with ArrowUp, ArrowDown, Home, and End', () => {
    render(<ProviderListHarness />)

    const alpha = screen.getByRole('option', { name: /Alpha/ })
    const beta = screen.getByRole('option', { name: /Beta/ })
    const gamma = screen.getByRole('option', { name: /Gamma/ })

    expect(alpha).toHaveAttribute('tabindex', '0')
    expect(beta).toHaveAttribute('tabindex', '-1')

    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowDown' })
    expect(beta).toHaveFocus()
    expect(beta).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(beta, { key: 'End' })
    expect(gamma).toHaveFocus()
    expect(gamma).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(gamma, { key: 'ArrowUp' })
    expect(beta).toHaveFocus()
    expect(beta).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(beta, { key: 'Home' })
    expect(alpha).toHaveFocus()
    expect(alpha).toHaveAttribute('aria-selected', 'true')
  })
})
