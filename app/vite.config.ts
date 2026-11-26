import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // The G2 WebView only ever talks to this origin; Vite proxies API calls
    // to the public demo backend server-side. This keeps the app manifest
    // whitelist to a single origin and avoids WebView proxy quirks.
    // NOTE (26 Nov): vite's proxy opens raw TLS and bypasses the VM egress
    // proxy, so it cannot reach Railway directly (EPROTO). It points at
    // the local verification-only relay /tmp/iris-railway-relay.py
    // (127.0.0.1:18081), which forwards to the Railway URL with urllib.
    // The .ehpk does NOT use vite — it fetches the Railway URL directly.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18081',
        rewrite: (p: string) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: { target: 'esnext' },
})
