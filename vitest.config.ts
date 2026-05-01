import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
  },
});
