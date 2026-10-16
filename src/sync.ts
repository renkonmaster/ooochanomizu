import { parseScene, type SceneObject } from "./model";

export type Role = "editor" | "viewer";
export type SyncStatus = "connecting" | "connected" | "waiting" | "reconnecting";
export interface Changes {
  upsert: SceneObject[];
  remove: string[];
}

export function diffScenes(before: SceneObject[], after: SceneObject[]): Changes {
  const previous = new Map(before.map((object) => [object.id, object]));
  const ids = new Set(after.map((object) => object.id));
  return {
    upsert: structuredClone(after.filter((object) =>
      JSON.stringify(previous.get(object.id)) !== JSON.stringify(object))),
    remove: before.filter((object) => !ids.has(object.id)).map((object) => object.id),
  };
}

export function applyChanges(objects: SceneObject[], changes: Changes): SceneObject[] {
  const result = new Map(objects.map((object) => [object.id, object]));
  for (const id of changes.remove) result.delete(id);
  for (const object of changes.upsert) result.set(object.id, object);
  return structuredClone([...result.values()]);
}

export function combineChanges(changes: Changes[]): Changes {
  const upsert = new Map<string, SceneObject>();
  const remove = new Set<string>();
  for (const change of changes) {
    for (const id of change.remove) { upsert.delete(id); remove.add(id); }
    for (const object of change.upsert) { remove.delete(object.id); upsert.set(object.id, object); }
  }
  return { upsert: [...upsert.values()], remove: [...remove] };
}

interface SyncOptions {
  url: string;
  room: string;
  role: Role;
  initial: SceneObject[];
  onScene: (objects: SceneObject[], initialized: boolean) => void;
  onStatus: (status: SyncStatus) => void;
  onError: (message: string) => void;
}

/** Keep local edits visible until the server acknowledges them. */
export class SceneSync {
  private socket: WebSocket | null = null;
  private role: Role;
  private current: SceneObject[];
  private seed: SceneObject[];
  private pending: { seq: number; changes: Changes }[] = [];
  private sequence = 0;
  private sentThrough = 0;
  private revision = -1;
  private ready = false;
  private stopped = false;
  private sendTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 1000;

  constructor(private options: SyncOptions) {
    this.role = options.role;
    this.current = structuredClone(options.initial);
    this.seed = structuredClone(options.initial);
    this.connect();
  }

  publish(objects: SceneObject[]): void {
    if (this.role !== "editor" || this.stopped) return;
    const changes = diffScenes(this.current, objects);
    if (!changes.upsert.length && !changes.remove.length) return;
    this.current = structuredClone(objects);
    this.seed = structuredClone(objects);
    this.pending.push({ seq: ++this.sequence, changes });
    // Limit network traffic while still sending during a drag or slider gesture.
    this.sendTimer ??= setTimeout(() => { this.sendTimer = undefined; this.flush(); }, 50);
  }

  flush(): void {
    clearTimeout(this.sendTimer);
    this.sendTimer = undefined;
    if (this.role !== "editor" || !this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    const unsent = this.pending.filter((patch) => patch.seq > this.sentThrough);
    if (!unsent.length) return;
    const seq = unsent[unsent.length - 1].seq;
    this.socket.send(JSON.stringify({ type: "patch", seq, changes: combineChanges(unsent.map((patch) => patch.changes)) }));
    this.sentThrough = seq;
  }

  setRole(role: Role): void {
    if (this.role === role) return;
    this.flush();
    this.role = role;
    this.ready = false;
    if (this.socket?.readyState === WebSocket.OPEN) this.join();
  }

  close(): void {
    this.flush();
    this.stopped = true;
    clearTimeout(this.sendTimer);
    clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  private join(): void {
    this.socket?.send(JSON.stringify({ type: "join", room: this.options.room, role: this.role, seed: this.seed }));
  }

  private connect(): void {
    if (this.stopped) return;
    this.options.onStatus(this.socket ? "reconnecting" : "connecting");
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    this.ready = false;
    this.revision = -1;
    this.sentThrough = 0;
    socket.onopen = () => { if (this.socket === socket && !this.stopped) this.join(); };
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.stopped) return;
      try {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state" || !Number.isSafeInteger(message.revision) || message.revision < this.revision) return;
        const initialized = message.objects !== null;
        const confirmed = initialized ? parseScene(JSON.stringify({ version: 1, objects: message.objects })) : [];
        this.revision = message.revision;
        this.ready = true;
        this.retryDelay = 1000;
        if (Number.isSafeInteger(message.ack)) this.pending = this.pending.filter((patch) => patch.seq > message.ack);
        this.current = this.role === "editor"
          ? this.pending.reduce((objects, patch) => applyChanges(objects, patch.changes), confirmed)
          : confirmed;
        if (initialized) this.seed = structuredClone(this.current);
        this.options.onScene(structuredClone(this.current), initialized);
        this.options.onStatus(initialized ? "connected" : "waiting");
        if (typeof message.error === "string") this.options.onError(message.error);
        this.flush();
      } catch { this.options.onError("同期データを読み込めませんでした。"); }
    };
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped) return;
      this.ready = false;
      this.options.onStatus("reconnecting");
      this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 10000);
    };
    // Connection failures also emit close, which schedules reconnection.
    socket.onerror = () => {};
  }
}
