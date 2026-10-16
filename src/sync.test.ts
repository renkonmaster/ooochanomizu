import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneSync, applyChanges, combineChanges, diffScenes } from "./sync";
import type { SceneObject } from "./model";

const object = (id = "a", scale = 1): SceneObject => ({
  id, kind: "cube", color: "#83cbb2", position: [0, 1, 0], rotation: [0, 0, 0], scale,
});

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  messages: Record<string, any>[] = [];
  onopen = () => {};
  onmessage = (_event: { data: string }) => {};
  onclose = () => {};
  onerror = () => {};
  constructor() { Socket.instances.push(this); }
  send(raw: string) { this.messages.push(JSON.parse(raw)); }
  open() { this.readyState = 1; this.onopen(); }
  close() { this.readyState = 3; this.onclose(); }
  state(objects: SceneObject[] | null, revision = 1, ack?: number) {
    this.onmessage({ data: JSON.stringify({ type: "state", objects, revision, ack }) });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function client(role: "editor" | "viewer" = "editor") {
  const onScene = vi.fn();
  const onStatus = vi.fn();
  const sync = new SceneSync({ url: "ws://localhost/sync", room: "main", role, initial: [object()], onScene, onStatus, onError: vi.fn() });
  const socket = Socket.instances[0];
  socket.open();
  return { sync, socket, onScene, onStatus };
}

describe("scene changes", () => {
  it("sends additions, changes and deletions without overwriting other objects", () => {
    const changes = diffScenes([object(), object("removed")], [object("a", 2), object("new")]);
    expect(changes.remove).toEqual(["removed"]);
    expect(applyChanges([object(), object("removed"), object("other")], changes)).toEqual([
      object("a", 2), object("other"), object("new"),
    ]);
  });
  it("combines frequent updates using the final value and removal", () => {
    const combined = combineChanges([
      { upsert: [object("a", 1.5), object("b")], remove: [] },
      { upsert: [object("a", 2)], remove: ["b"] },
    ]);
    expect(combined).toEqual({ upsert: [object("a", 2)], remove: ["b"] });
  });
});

describe("WebSocket scene client", () => {
  it("streams edits before gesture completion and keeps later edits over older acknowledgements", () => {
    const { sync, socket, onScene } = client();
    socket.state([object()]);
    sync.publish([object("a", 1.5)]);
    vi.advanceTimersByTime(50);
    expect(socket.messages.at(-1)).toMatchObject({ type: "patch", seq: 1 });
    sync.publish([object("a", 2)]);
    socket.state([object("a", 1.5)], 2, 1);
    expect(onScene).toHaveBeenLastCalledWith([object("a", 2)], true);
    expect(socket.messages.at(-1)).toMatchObject({ type: "patch", seq: 2 });
    socket.state([object("a", 2)], 3, 2);
    expect(onScene).toHaveBeenLastCalledWith([object("a", 2)], true);
    sync.close();
  });
  it("receives in Viewer without sending edits, and preserves its seed while waiting for Editor", () => {
    const { sync, socket, onScene, onStatus } = client("viewer");
    socket.state(null, 0);
    expect(onScene).toHaveBeenLastCalledWith([], false);
    expect(onStatus).toHaveBeenLastCalledWith("waiting");
    sync.publish([object("a", 2)]);
    vi.advanceTimersByTime(100);
    expect(socket.messages).toHaveLength(1);
    sync.setRole("editor");
    expect(socket.messages.at(-1)).toMatchObject({ type: "join", role: "editor", seed: [object()] });
    sync.close();
  });
  it("reconnects, rebases offline changes on the newest scene and resends unacknowledged edits", () => {
    const { sync, socket, onScene, onStatus } = client();
    socket.state([object()]);
    sync.publish([object("a", 1.5)]);
    sync.flush();
    socket.close();
    sync.publish([object("a", 2)]);
    vi.advanceTimersByTime(1000);
    const replacement = Socket.instances[1];
    replacement.open();
    replacement.state([object("a", 1.5), object("other")], 7);
    expect(onScene).toHaveBeenLastCalledWith([object("a", 2), object("other")], true);
    expect(replacement.messages.at(-1)).toMatchObject({ type: "patch", seq: 2, changes: { upsert: [object("a", 2)] } });
    expect(onStatus).toHaveBeenCalledWith("reconnecting");
    sync.close();
    vi.advanceTimersByTime(10000);
    expect(Socket.instances).toHaveLength(2);
  });
  it("flushes an unfinished gesture before switching to Viewer and never echoes remote changes", () => {
    const { sync, socket } = client();
    socket.state([object()]);
    sync.publish([object("a", 2)]);
    sync.setRole("viewer");
    expect(socket.messages.slice(-2).map((message) => message.type)).toEqual(["patch", "join"]);
    socket.state([object("a", 2)], 2, 1);
    socket.state([object("a", 3)], 3);
    vi.advanceTimersByTime(100);
    expect(socket.messages).toHaveLength(3);
    sync.close();
  });
});
