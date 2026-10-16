import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { attachSceneSync } from "./sync.mjs";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

export function createAppServer(directory = dist) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      let path = resolve(root, `.${pathname}`);
      if (!path.startsWith(root + sep) && path !== root) { response.writeHead(403).end(); return; }
      if (!extname(path)) path = resolve(root, "index.html");
      const info = await stat(path);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
      const headers = {
        "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        "ETag": etag,
        "Last-Modified": info.mtime.toUTCString(),
      };
      const unchanged = request.headers["if-none-match"]?.split(",").some((tag) => tag.trim() === etag || tag.trim() === "*");
      if (unchanged) { response.writeHead(304, headers).end(); return; }
      response.writeHead(200, { ...headers, "Content-Type": mime[extname(path)] ?? "application/octet-stream", "Content-Length": info.size });
      if (request.method === "HEAD") { response.end(); return; }
      // Backpressure keeps concurrent model downloads bounded by small chunks.
      await pipeline(createReadStream(path, { highWaterMark: 64 * 1024 }), response);
    } catch {
      if (response.headersSent || response.destroyed) response.destroy();
      else response.writeHead(404).end("Not found");
    }
  });
  attachSceneSync(server);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3000);
  createAppServer().listen(port, host, () => console.log(`Atelier: http://${host}:${port}`));
}
