import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AiDraftDot } from './AiDraftDot'

describe('AiDraftDot', () => {
  it('marks a file LinX changed with the plain hint', () => {
    render(<AiDraftDot />)
    expect(screen.getByRole('img', { name: 'LinX 改了，还没确认' })).toBeTruthy()
    expect(screen.queryByText('LinX 改了，还没确认')).toBeNull()
  })

  it('can spell the hint out where the row has room', () => {
    render(<AiDraftDot showText />)
    expect(screen.getByText('LinX 改了，还没确认')).toBeTruthy()
  })
})
