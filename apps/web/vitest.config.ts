import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 순수 로직 단위 테스트용(node 환경). UI/통합은 E2E(P3)에서 다룬다.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
