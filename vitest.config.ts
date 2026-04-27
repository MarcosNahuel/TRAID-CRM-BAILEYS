import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      // Dotenv no carga el .env en todos los runners — setear explícitamente los vars necesarios para integration
    },
    setupFiles: ['./vitest.setup.ts'],
  },
})
