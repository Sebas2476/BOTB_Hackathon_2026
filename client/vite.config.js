import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Marketing pages (index.html at /, pricing.html at /pricing) and the MAAT app (app.html, served under /app).
const appRoutes = {
  name: 'app-routes',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = req.url.split('?')[0]
      if (path === '/app' || (path.startsWith('/app/') && !path.includes('.'))) req.url = '/app.html'
      else if (path === '/pricing' || path === '/pricing/') req.url = '/pricing.html'
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), appRoutes],
  build: {
    rollupOptions: {
      input: { main: 'index.html', pricing: 'pricing.html', app: 'app.html' },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/store': 'http://localhost:3001',
      '/demo-store': 'http://localhost:3001',
      '/robots.txt': 'http://localhost:3001',
    },
  },
})
