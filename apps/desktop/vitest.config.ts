import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
    testTimeout: process.env.CI ? 15_000 : 5_000,
    poolOptions: process.env.CI
      ? {
          threads: {
            maxThreads: 2,
            minThreads: 1,
          },
        }
      : undefined,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/main/services/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        '**/*.integration.test.ts',
        // External channel adapters and heavy orchestration are covered by integration/e2e paths.
        '**/channels/**',
        '**/app-update/**',
        '**/knowledge-source.service.ts',
        '**/knowledge-dedup.service.ts',
        '**/db-worker.service.ts',
        '**/agent-regenerate.ts',
        '**/agent-send.ts',
        '**/agent.service.ts',
        '**/agent-llm.ts',
        '**/agent-state.ts',
        '**/agent-messages.ts',
        '**/blob.service.ts',
      ],
      thresholds: {
        lines: 30,
        functions: 30,
        statements: 30,
        branches: 20,
      },
    },
  },
})