import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createAppServer } from "../server/index.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "atelier-http-"));
  const model = Buffer.alloc(2 * 1024 * 1024, 123);
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), "<main>atelier</main>");
  await writeFile(join(directory, "model.task"), model);
  await writeFile(join(directory, "vision.wasm"), model);
  await writeFile(join(directory, "assets", "index-hash.js"), "console.log('atelier');");
  const server = createAppServer(directory);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, directory, model };
}

test("streams concurrent large downloads without changing bytes or MIME types", async (t) => {
  const { base, model } = await fixture(t);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const wasm = index % 2 === 0;
    const response = await fetch(base + (wasm ? "/vision.wasm" : "/model.task"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), wasm ? "application/wasm" : "application/octet-stream");
    assert.equal(Number(response.headers.get("content-length")), model.length);
    assert.equal(digest(new Uint8Array(await response.arrayBuffer())), digest(model));
  }));
});

test("HEAD and ETag avoid resending models while changed files invalidate the cache", async (t) => {
  const { base, directory, model } = await fixture(t);
  const head = await fetch(base + "/model.task", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get("content-length")), model.length);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const etag = head.headers.get("etag");
  assert(etag);
  assert.equal(head.headers.get("cache-control"), "no-cache");
  const cached = await fetch(base + "/model.task", { headers: { "If-None-Match": etag } });
  assert.equal(cached.status, 304);
  assert.equal((await cached.arrayBuffer()).byteLength, 0);
  await writeFile(join(directory, "model.task"), "updated model");
  const updated = await fetch(base + "/model.task", { headers: { "If-None-Match": etag } });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.headers.get("etag"), etag);
  assert.equal(await updated.text(), "updated model");
  const asset = await fetch(base + "/assets/index-hash.js");
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  await asset.text();
});

test("client cancellation does not crash the server, and missing/outside files stay inaccessible", async (t) => {
  const { base } = await fixture(t);
  await new Promise((resolve, reject) => {
    const request = get(base + "/model.task", (response) => {
      response.once("data", () => { request.destroy(); resolve(); });
    });
    request.on("error", (error) => { if (error.code !== "ECONNRESET") reject(error); });
  });
  const next = await fetch(base);
  assert.equal(next.status, 200);
  assert.equal(await next.text(), "<main>atelier</main>");
  assert.equal((await fetch(base + "/missing.wasm")).status, 404);
  assert.equal((await fetch(base + "/%2e%2e%2foutside.txt")).status, 403);
});
