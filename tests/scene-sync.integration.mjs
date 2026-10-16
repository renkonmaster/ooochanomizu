import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { attachSceneSync } from "../server/sync.mjs";

const object = (id = "a", scale = 1) => ({ id, kind: "cube", color: "#83cbb2", position: [0, 1, 0], rotation: [0, 0, 0], scale });

async function fixture(t) {
  const server = createServer();
  const hub = attachSceneSync(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.terminate();
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  });
  return async (role, room = "main", seed = [object()]) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/sync`);
    clients.push(socket);
    const queue = [];
    let wake;
    socket.on("message", (raw) => { queue.push(JSON.parse(raw)); wake?.(); });
    await once(socket, "open");
    socket.send(JSON.stringify({ type: "join", role, room, seed }));
    return {
      socket,
      patch(seq, upsert = [], remove = []) { socket.send(JSON.stringify({ type: "patch", seq, changes: { upsert, remove } })); },
      async state() {
        if (!queue.length) await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Timed out waiting for scene")), 2000);
          wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
        });
        return queue.shift();
      },
    };
  };
}

test("Viewer receives Editor changes, late join and reconnect over real WebSockets", async (t) => {
  const connect = await fixture(t);
  const viewer = await connect("viewer");
  assert.equal((await viewer.state()).objects, null);
  const editor = await connect("editor");
  assert.deepEqual((await editor.state()).objects, [object()]);
  assert.deepEqual((await viewer.state()).objects, [object()]);
  const changed = { ...object("a", 2), color: "#f0a58b", position: [2, 3, -1], rotation: [0.5, 1, 0] };
  editor.patch(1, [changed, object("b")]);
  assert.equal((await editor.state()).ack, 1);
  assert.deepEqual((await viewer.state()).objects, [changed, object("b")]);
  editor.patch(2, [], ["a"]);
  await editor.state();
  assert.deepEqual((await viewer.state()).objects, [object("b")]);
  const late = await connect("viewer");
  assert.deepEqual((await late.state()).objects, [object("b")]);
  viewer.socket.terminate();
  const reconnected = await connect("viewer");
  assert.deepEqual((await reconnected.state()).objects, [object("b")]);
});

test("server isolates rooms, merges different objects and preserves empty scenes", async (t) => {
  const connect = await fixture(t);
  const first = await connect("editor", "shared", [object("a"), object("b")]);
  await first.state();
  const second = await connect("editor", "shared", [object("stale")]);
  assert.deepEqual((await second.state()).objects, [object("a"), object("b")]);
  const isolated = await connect("editor", "other", [object("isolated")]);
  await isolated.state();
  first.patch(1, [object("a", 2)]);
  second.patch(1, [object("b", 3)]);
  await first.state(); await second.state();
  const final = await second.state(); await first.state();
  assert.deepEqual(final.objects, [object("a", 2), object("b", 3)]);
  const otherViewer = await connect("viewer", "other");
  assert.deepEqual((await otherViewer.state()).objects, [object("isolated")]);
  first.patch(2, [], ["a", "b"]);
  assert.deepEqual((await first.state()).objects, []);
  const lateEditor = await connect("editor", "shared", [object("stale")]);
  assert.deepEqual((await lateEditor.state()).objects, []);
});

test("invalid edits leave the scene intact and Viewer cannot publish", async (t) => {
  const connect = await fixture(t);
  const editor = await connect("editor");
  await editor.state();
  editor.patch(1, [object("a", 999)]);
  const rejected = await editor.state();
  assert.equal(rejected.ack, 1);
  assert(rejected.error);
  assert.deepEqual(rejected.objects, [object()]);
  const viewer = await connect("viewer");
  await viewer.state();
  const closed = once(viewer.socket, "close");
  viewer.patch(1, [], ["a"]);
  assert.equal((await closed)[0], 1008);
  const late = await connect("viewer");
  assert.deepEqual((await late.state()).objects, [object()]);
});
