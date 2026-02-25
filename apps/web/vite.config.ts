import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['@tanstack/react-router'],
          query: ['@tanstack/react-query'],
          solid: ['@inrupt/solid-client', '@inrupt/solid-client-authn-browser', '@undefineds.co/drizzle-solid'],
          ui: ['@radix-ui/react-slot', '@radix-ui/react-avatar', 'class-variance-authority', 'lucide-react']
        }
      }
    }
  }
})
