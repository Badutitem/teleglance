import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // The G2 WebView only ever talks to this origin; Vite proxies API calls
    // to the TeleGlance backend server-side. This keeps the app manifest
    // whitelist to a single origin and avoids WebView proxy quirks.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        rewrite: (p: string) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: { target: 'esnext' },
})
