import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiTarget = env.VITE_DEV_API_URL || 'http://localhost:8000'

  return {
    plugins: [
      vue(),
      // DevTools plugin uses APIs unavailable in mobile Safari — disable via VITE_NO_DEVTOOLS=true
      ...(command === 'serve' && !env.VITE_NO_DEVTOOLS
        ? [(await import('vite-plugin-vue-devtools')).default()]
        : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
        },
        '/auth': {
          target: devApiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: '../pyMC_Repeater/repeater/web/html',
      emptyOutDir: true,
    },
  }
})
