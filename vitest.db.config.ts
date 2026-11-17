import { defineConfig } from 'vitest/config'

/** Тесты сервера на настоящем Postgres. Запускаются из scripts/test-db.sh. */
export default defineConfig({
  test: { include: ['supabase/test/**/*.test.ts'], environment: 'node', fileParallelism: false },
})
