import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/oauth2': { target: process.env.VILLAS_API_TARGET ?? 'http://127.0.0.1:9098', changeOrigin: false },
      '/login/oauth2': { target: process.env.VILLAS_API_TARGET ?? 'http://127.0.0.1:9098', changeOrigin: false },
      '/api': {
        target: process.env.VILLAS_API_TARGET ?? 'http://127.0.0.1:9098',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/oauth2': { target: process.env.VILLAS_API_TARGET ?? 'http://127.0.0.1:9098', changeOrigin: false },
      '/login/oauth2': { target: process.env.VILLAS_API_TARGET ?? 'http://127.0.0.1:9098', changeOrigin: false },
      '/api': {
        target: process.env.VILLAS_API_TARGET ?? 'http://127.0.0.1:9098',
        changeOrigin: false,
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/api/generated/**', 'src/main.tsx', 'src/test/**'],
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
})
