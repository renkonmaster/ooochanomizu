import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "server/index.mjs",
    target: "node24",
    outDir: "dist-server",
    rolldownOptions: {
      output: { entryFileNames: "index.mjs" },
    },
  },
});
