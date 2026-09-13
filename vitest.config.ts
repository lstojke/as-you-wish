import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcAlias = fileURLToPath(new URL("./src", import.meta.url));

// Two projects keep fast, dependency-free unit specs separate from the
// integration specs that hit the local Supabase stack, so each can be run and
// gated independently. The Astro Vite plugin is intentionally NOT registered:
// unit specs must stay free of `astro:*` virtual modules.
export default defineConfig({
  resolve: {
    alias: {
      "@": srcAlias,
    },
  },
  test: {
    projects: [
      {
        resolve: { alias: { "@": srcAlias } },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: { "@": srcAlias } },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/integration.ts"],
          testTimeout: 20000,
        },
      },
    ],
  },
});
