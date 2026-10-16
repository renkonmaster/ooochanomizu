import { WebSocket, WebSocketServer } from "ws";
import { parseScene, MAX_OBJECTS } from "../src/model.ts";

const validate = (objects) => parseScene(JSON.stringify({ version: 1, objects }));

export function attachSceneSync(server) {
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });
  const state = (room, extra = {}) => JSON.stringify({ type: "state", revision: room.revision, objects: room.objects, ...extra });
  function sendMessage(client, message) {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 1_000_000) return client.terminate();
    client.send(message);
  }
  const send = (client, room, extra) => sendMessage(client, state(room, extra));
  function broadcast(roomId, sender, seq) {
    const room = rooms.get(roomId);
    const message = state(room);
    const acknowledged = seq === undefined ? message : state(room, { ack: seq });
    for (const client of wss.clients) {
      if (client.room === roomId) sendMessage(client, client === sender ? acknowledged : message);
    }
  }
  function upgrade(request, socket, head) {
    if (new URL(request.url, "http://localhost").pathname !== "/sync") return;
    wss.handleUpgrade(request, socket, head, (client) => wss.emit("connection", client));
  }
  server.on("upgrade", upgrade);
  wss.on("connection", (client) => {
    client.alive = true;
    client.on("pong", () => { client.alive = true; });
    client.on("error", () => {});
    client.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
        if (message.type === "join") {
          if (typeof message.room !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(message.room) || !["editor", "viewer"].includes(message.role)) throw new Error("Invalid join");
          let room = rooms.get(message.room);
          if (!room) { room = { objects: null, revision: 0 }; rooms.set(message.room, room); }
          const seed = message.role === "editor" && room.objects === null ? validate(message.seed) : null;
          client.room = message.room;
          client.role = message.role;
          if (seed !== null) {
            room.objects = seed;
            room.revision++;
            broadcast(client.room);
          } else send(client, room);
          return;
        }
        if (message.type !== "patch" || client.role !== "editor" || !client.room || !Number.isSafeInteger(message.seq) || message.seq < 1) throw new Error("Invalid patch");
        const room = rooms.get(client.room);
        try {
          const upsert = validate(message.changes?.upsert);
          const remove = message.changes?.remove;
          if (!Array.isArray(remove) || remove.length > MAX_OBJECTS || remove.some((id) => typeof id !== "string" || id.length > 100)) throw new Error("Invalid removal");
          const merged = new Map(room.objects.map((object) => [object.id, object]));
          for (const id of remove) merged.delete(id);
          for (const object of upsert) merged.set(object.id, object);
          room.objects = validate([...merged.values()]);
          room.revision++;
          broadcast(client.room, client, message.seq);
        } catch {
          send(client, room, { ack: message.seq, error: "変更を同期できませんでした。立体は100個までです。" });
        }
      } catch { client.close(1008, "Invalid scene message"); }
    });
  });
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.alive) { client.terminate(); continue; }
      client.alive = false;
      client.ping();
    }
  }, 30000);
  heartbeat.unref();
  function close() {
    clearInterval(heartbeat);
    server.off("upgrade", upgrade);
    for (const client of wss.clients) client.terminate();
    wss.close();
  }
  server.once("close", close);
  return { close };
}
