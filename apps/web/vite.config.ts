import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function getPackageName(id: string): string | null {
  const marker = '/node_modules/'
  const start = id.lastIndexOf(marker)
  if (start === -1) return null

  const remainder = id.slice(start + marker.length)
  const segments = remainder.split('/')
  if (segments[0]?.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : segments[0]
  }
  return segments[0] ?? null
}

function resolveVendorChunk(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined

  const pkg = getPackageName(id)
  if (!pkg) return undefined

  if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') {
    return 'vendor-react'
  }

  if (pkg.startsWith('@tanstack/')) {
    return 'vendor-tanstack'
  }

  if (
    pkg.startsWith('@radix-ui/') ||
    pkg.startsWith('@floating-ui/') ||
    pkg === 'aria-hidden' ||
    pkg === 'lucide-react' ||
    pkg === 'class-variance-authority' ||
    pkg === 'tailwind-merge' ||
    pkg === 'clsx' ||
    pkg === 'cmdk' ||
    pkg === 'react-remove-scroll' ||
    pkg === 'react-remove-scroll-bar' ||
    pkg === 'react-style-singleton' ||
    pkg === 'use-callback-ref' ||
    pkg === 'use-sidecar'
  ) {
    return 'vendor-ui'
  }

  if (
    pkg === 'zustand' ||
    pkg === 'react-resizable-panels'
  ) {
    return 'vendor-state'
  }

  if (
    pkg === 'react-markdown' ||
    pkg === 'remark-gfm' ||
    pkg === 'remark-math' ||
    pkg === 'rehype-katex' ||
    pkg === 'katex'
  ) {
    return 'vendor-markdown'
  }

  if (pkg === 'mermaid' || pkg === 'd3' || pkg.startsWith('d3-')) {
    return 'vendor-mermaid'
  }

  return undefined
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveVendorChunk(id)
        },
      },
    },
  },
})
