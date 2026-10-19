import { defineConfig } from "vitest/config";
import path from "node:path";

// Security-rules tests (and the Firestore adapters, run against the emulator) need the Firebase emulators: run with `pnpm test:rules`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/rules/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false },
});
