/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['VITE_API_URL', 'FRONTEND_TUNNEL_HOST'])
  const tunnelHost = env.FRONTEND_TUNNEL_HOST?.trim().toLowerCase()
  if (tunnelHost && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tunnelHost)) {
    throw new Error('FRONTEND_TUNNEL_HOST deve ser um hostname exato, sem protocolo, porta ou curinga.')
  }

  return {
    plugins: [react()],
    optimizeDeps: { include: ['@techstark/opencv-js'] },
    server: {
      port: 5173,
      allowedHosts: ['localhost', '127.0.0.1', ...(tunnelHost ? [tunnelHost] : [])],
    },
    envPrefix: [],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL ?? ''),
    },
    test: {
      environment: 'jsdom',
    },
  }
})
