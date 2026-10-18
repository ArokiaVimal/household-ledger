import { defineConfig } from "vitest/config";

// Security-rules tests need the Firebase emulators: run with `pnpm test:rules`.
export default defineConfig({
  test: { include: ["tests/rules/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false },
});
