import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/guardian-recovery/unit/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@/": `${srcDir}/`,
    },
  },
});
