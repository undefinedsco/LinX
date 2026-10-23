import { describe, expect, it } from 'vitest'

import { projectWhiteboardFilePreview } from './whiteboard-space-queries'

describe('projectWhiteboardFilePreview', () => {
  it('turns markdown into a few plain lines without the repeated title', () => {
    const text = projectWhiteboardFilePreview('# 会议纪要\n\n- **决定**：先做 [试点](https://example.com)\n> 下周复盘', '会议纪要')
    expect(text).toBe('决定：先做 试点\n下周复盘')
  })

  it('cuts long text with an ellipsis', () => {
    expect(projectWhiteboardFilePreview('字'.repeat(300), '标题', 10)).toBe(`${'字'.repeat(10)}…`)
  })
})
