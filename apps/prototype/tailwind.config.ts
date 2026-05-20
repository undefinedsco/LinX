import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../web/src/index.css',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        lineage: {
          DEFAULT: 'hsl(var(--lineage))',
          foreground: 'hsl(var(--lineage-foreground))',
        },
        boundary: {
          DEFAULT: 'hsl(var(--boundary))',
          foreground: 'hsl(var(--boundary-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        layout: {
          sidebar: 'hsl(var(--layout-sidebar))',
          'list-header': 'hsl(var(--layout-list-header))',
          'list-hover': 'hsl(var(--layout-list-hover))',
          'list-item': 'hsl(var(--layout-list-item))',
          'list-selected': 'hsl(var(--layout-list-selected))',
          content: 'hsl(var(--layout-content))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      borderRadius: {
        none: '0',
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'calc(var(--radius-xl) + 4px)',
        '3xl': 'calc(var(--radius-xl) + 8px)',
        full: '9999px',
      },
      fontFamily: {
        sans: ['SF Pro Text', 'SF Pro Display', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'SFMono-Regular', 'JetBrains Mono', 'monospace'],
      },
      opacity: {
        8: '0.08',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
