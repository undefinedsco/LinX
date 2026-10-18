import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')
const tailwindConfig = readFileSync('tailwind.config.ts', 'utf8')
const dropdownMenu = readFileSync('src/components/ui/dropdown-menu.tsx', 'utf8')
const select = readFileSync('src/components/ui/select.tsx', 'utf8')
const dialog = readFileSync('src/components/ui/dialog.tsx', 'utf8')
const textarea = readFileSync('src/components/ui/textarea.tsx', 'utf8')
const tooltip = readFileSync('src/components/ui/tooltip.tsx', 'utf8')

describe('global design tokens', () => {
  it('keeps warm paper surfaces separate from the sparse ink accent', () => {
    expect(css).toContain('--background: 42 38% 95%')
    expect(css).toContain('--secondary: 41 38% 92%')
    expect(css).toContain('--border: 36 14% 85%')
    expect(css).toContain('--layout-sidebar: 18 16% 87%')
    expect(css).toContain('--primary: 261 36% 38%')
    expect(css).toMatch(/:root,\s*\.light \{/)
    expect(css).not.toContain('--background: 0 0% 98%')
    expect(css).not.toContain('--layout-content: 0 0% 100%')
    expect(css).not.toContain('purple-tinted neutral')
    expect(css).not.toContain('Purple-tinted neutral')
  })

  it('caps global large-radius tiers at the dialog range', () => {
    expect(css).toContain('--radius-xl: 16px')
    expect(css).toContain('--radius-2xl: 16px')
    expect(css).toContain('--radius-3xl: 16px')
    expect(tailwindConfig).toContain('"2xl": "var(--radius-2xl)"')
    expect(tailwindConfig).toContain('"3xl": "var(--radius-3xl)"')
    expect(tailwindConfig).not.toContain('calc(var(--radius-xl)')
  })

  it('keeps shared menus on solid neutral surfaces without legacy decorative chrome', () => {
    for (const source of [dialog, dropdownMenu, select, textarea, tooltip]) {
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('rgba(124,58,237')
      expect(source).not.toContain('温暖守护者')
    }
  })
})
