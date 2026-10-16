import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { attachSceneSync } from "./sync.mjs";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

export function createAppServer() {
  const server = createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      let path = resolve(dist, `.${pathname}`);
      if (!path.startsWith(resolve(dist) + sep) && path !== resolve(dist)) { response.writeHead(403).end(); return; }
      if (!extname(path)) path = resolve(dist, "index.html");
      const info = await stat(path);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "Content-Type": mime[extname(path)] ?? "application/octet-stream", "Content-Length": info.size });
      response.end(request.method === "HEAD" ? undefined : await readFile(path));
    } catch { response.writeHead(404).end("Not found"); }
  });
  attachSceneSync(server);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3000);
  createAppServer().listen(port, host, () => console.log(`Atelier: http://${host}:${port}`));
}
