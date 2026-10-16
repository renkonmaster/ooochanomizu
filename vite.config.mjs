import { defineConfig } from "vite";
import { attachSceneSync } from "./server/sync.mjs";

export default defineConfig({
  plugins: [{
    name: "scene-sync",
    configureServer(server) { if (server.httpServer) attachSceneSync(server.httpServer); },
    configurePreviewServer(server) { attachSceneSync(server.httpServer); },
  }],
});
