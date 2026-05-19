import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig(async (configEnv) => 
  mergeConfig(
    await viteConfig(configEnv),
    defineConfig({
      test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.ts'],
        exclude: [...configDefaults.exclude, 'e2e/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
      },
    }),
  )
)
