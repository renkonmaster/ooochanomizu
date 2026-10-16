import "./style.css";
import { AtelierScene, type ViewMode } from "./scene";
import { HandCamera } from "./hand";
import { atelierMenu } from "./menu";
import { HandMenu } from "./hand-menu";
import { SceneSync } from "./sync";
import { HandInteraction, type DetectedHand, type Gesture } from "./gesture";
import {
  COLORS,
  LABELS,
  MAX_OBJECTS,
  makeObject,
  parseScene,
  serializeScene,
  type Primitive,
  type SceneObject,
} from "./model";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <h1 class="brand">てのひらアトリエ</h1>
    <div class="top-actions"><button id="export" class="quiet">ファイルに保存</button><button id="import" class="quiet">ファイルを開く</button><input id="file" type="file" accept="application/json,.json" hidden></div>
  </header>
  <main class="workspace">
    <section class="studio" aria-label="創作エリア">
      <div id="viewport" class="viewport">
        ${atelierMenu}
        <span id="sync-status" class="sync-status" role="status" aria-live="polite" data-state="connecting">接続中…</span>
        <div id="hand-cursor" class="hand-cursor" hidden><span></span><small id="object-cursor-label">右手 · 立体・メニュー</small></div>
        <div id="view-cursor" class="hand-cursor view-cursor" hidden><span></span><small id="view-cursor-label">左手 · 視点</small></div>
        <div id="grab-pill" class="grab-pill" hidden>移動中</div>
        <div class="canvas-bottom"><span id="interaction-hint">ドラッグで移動</span><span class="view-hint">右ドラッグ：視点回転　スクロール：ズーム</span></div>
      </div>
      <div class="camera-strip"><div class="camera-preview"><video id="webcam" playsinline muted aria-label="カメラプレビュー"></video><canvas id="landmarks" width="320" height="240" aria-hidden="true"></canvas><span id="camera-placeholder">映像なし</span></div><div class="camera-copy"><div class="camera-title"><h2>手の入力</h2><span id="camera-status" class="status-tag">停止中</span></div><p id="camera-message">親指と人差し指をつまんで操作します。</p><span class="privacy-note">映像は端末内で処理されます。</span></div><button id="camera-toggle" class="primary">カメラを開始</button></div>
      <div class="input-guide" aria-label="手の操作"><span id="howto-view">左手：視点</span><span id="howto-object">右手：立体・メニュー</span><span>つまむ：決定・移動 / 開く：終了</span></div>
    </section>
  </main><div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`;

const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const viewport = element<HTMLDivElement>("viewport");
const video = element<HTMLVideoElement>("webcam");
const cursor = element<HTMLDivElement>("hand-cursor");
const viewCursor = element<HTMLDivElement>("view-cursor");
const cameraButton = element<HTMLButtonElement>("camera-toggle");
const hands = new HandInteraction();
const handPreferenceKey = "tenohira-atelier.viewport-hand.v1";
try {
  if (localStorage.getItem(handPreferenceKey) === "Right")
    hands.setViewportHand("Right");
} catch { /* Hand controls work even if browser storage is unavailable. */ }
let viewMode: ViewMode = "orbit";
const requestedRoom = new URLSearchParams(location.search).get("room") ?? "main";
const room = /^[a-zA-Z0-9_-]{1,64}$/.test(requestedRoom) ? requestedRoom : "main";
const storageKey = `tenohira-atelier.scene.v1${room === "main" ? "" : `.${room}`}`;
let objects: SceneObject[] = [
  makeObject("cube", COLORS[0], 2),
  makeObject("sphere", COLORS[1], 1),
  makeObject("torus", COLORS[2], 3),
];
objects[1].position = [-2, 0.8, 0.5];
objects[2].position = [2, 0.9, -0.3];
let storageFailed = false;
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) objects = parseScene(stored);
} catch {
  storageFailed = true;
}
let selected: string | null = null;
let activeColor = COLORS[0];
let activePrimitive: Primitive = "cube";
type Menu = "add" | "color" | "edit" | "view";
let openMenu: Menu | null = null;
let dragSource: "mouse" | "hand" | null = null;
let pendingSave = false;
let cameraState: "off" | "starting" | "on" = "off";
let viewerMode = false;
let sceneSync: SceneSync | null = null;
let toastTimer = 0;
let view: AtelierScene;

function toast(message: string): void {
  const node = element("toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, 4000);
}

try {
  view = new AtelierScene(viewport);
} catch {
  viewport.innerHTML =
    '<div class="graphics-error"><h2>3D表示を開始できませんでした</h2><p>WebGLに対応したブラウザで、ハードウェアアクセラレーションを有効にして再読み込みしてください。</p></div>';
  document.querySelectorAll("button, input").forEach((n) => {
    (n as HTMLButtonElement).disabled = true;
  });
  throw new Error("WebGL initialization failed");
}

const handMenu = new HandMenu(viewport);

function current(): SceneObject | undefined {
  return objects.find((o) => o.id === selected);
}
function persist(): void {
  try {
    localStorage.setItem(storageKey, serializeScene(objects));
  } catch {
    if (!storageFailed)
      toast("自動保存できません。「作品を保存」でファイルに保存してください。");
    storageFailed = true;
  }
}
function updateUI(): void {
  const object = current();
  element("object-count").textContent = `立体 ${objects.length}`;
  element<HTMLFieldSetElement>("transform").disabled = !object;
  element("selection-name").textContent = object
    ? `${LABELS[object.kind]}を選択中`
    : "未選択";
  element("color-target").textContent = object
    ? `${LABELS[object.kind]}の色。次の追加にも使用します。`
    : "追加する立体の色";
  element<HTMLButtonElement>("clear-selection").disabled = !object;
  element<HTMLButtonElement>("add-object").disabled = objects.length >= MAX_OBJECTS;
  element("add-object").textContent = `${LABELS[activePrimitive]}を追加`;
  document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.kind === activePrimitive));
  });
  if (object) {
    element<HTMLInputElement>("scale").value = String(object.scale);
    element("scale-value").textContent = `${object.scale.toFixed(2)}×`;
    element<HTMLInputElement>("depth").value = String(object.position[2]);
    element("depth-value").textContent = object.position[2].toFixed(1);
    const degrees = Math.round((object.rotation[1] * 180) / Math.PI);
    element<HTMLInputElement>("rotate").value = String(degrees);
    element("rotate-value").textContent = `${degrees}°`;
  }
  document
    .querySelectorAll<HTMLButtonElement>(".swatch")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.color === (object?.color ?? activeColor)),
      ),
    );
}
function sync(): void {
  view.sync(objects);
  view.select(selected);
  updateUI();
}
function select(id: string | null): void {
  if (selected === id) return;
  selected = id;
  view.select(id);
  updateUI();
}
function finishEdit(): void {
  if (pendingSave) {
    pendingSave = false;
    sceneSync?.flush();
    persist();
    updateUI();
  }
}
function release(): void {
  dragSource = null;
  view.endDrag();
  cursor.classList.remove("grabbing");
  element("grab-pill").hidden = true;
  finishEdit();
}
function edit(action: () => void): void {
  if (viewerMode) return;
  release();
  action();
  pendingSave = true;
  sceneSync?.publish(objects);
  sync();
  finishEdit();
}
function grab(
  id: string,
  x: number,
  y: number,
  source: "mouse" | "hand",
): void {
  if (viewerMode || dragSource) return;
  select(id);
  if (!view.beginDrag(id, x, y)) return;
  dragSource = source;
  element("grab-pill").hidden = false;
  cursor.classList.add("grabbing");
}
function move(x: number, y: number): void {
  if (viewerMode) return;
  const object = current();
  const position = view.drag(x, y);
  if (!object || !position) return;
  object.position = position;
  pendingSave = true;
  sceneSync?.publish(objects);
  view.sync(objects);
}

function setMenu(menu: Menu | null): void {
  handMenu.reset();
  openMenu = menu;
  for (const name of ["add", "color", "edit", "view"] as const) {
    element(`menu-${name}`).hidden = name !== menu;
  }
  document.querySelectorAll<HTMLButtonElement>("[data-menu]").forEach((button) => {
    button.setAttribute("aria-expanded", String(button.dataset.menu === menu));
  });
}
document.querySelectorAll<HTMLButtonElement>("[data-menu]").forEach((button) => {
  button.addEventListener("click", () => {
    release();
    const menu = button.dataset.menu as Menu;
    setMenu(openMenu === menu ? null : menu);
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-menu-close]").forEach((button) => {
  button.addEventListener("click", () => setMenu(null));
});
document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((button) => {
  button.addEventListener("click", () => {
    activePrimitive = button.dataset.kind as Primitive;
    updateUI();
  });
});
element("add-object").addEventListener("click", () => {
  if (objects.length >= MAX_OBJECTS) {
    toast("立体は100個まで追加できます。");
    return;
  }
  edit(() => {
    const object = makeObject(activePrimitive, activeColor, objects.length);
    objects.push(object);
    selected = object.id;
  });
  setMenu(null);
});
element("clear-selection").addEventListener("click", () => {
  release();
  select(null);
});
document.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((button) =>
  button.addEventListener("click", () => {
    activeColor = button.dataset.color!;
    if (current())
      edit(() => {
        current()!.color = activeColor;
      });
    else updateUI();
  }),
);
for (const id of ["scale", "depth", "rotate"]) {
  const input = element<HTMLInputElement>(id);
  input.addEventListener("input", () => {
    if (viewerMode) return;
    if (dragSource) release();
    const object = current();
    if (!object) return;
    pendingSave = true;
    const value = Number(input.value);
    if (id === "scale") object.scale = value;
    else if (id === "depth") object.position[2] = value;
    else object.rotation[1] = (value * Math.PI) / 180;
    sceneSync?.publish(objects);
    view.sync(objects);
    updateUI();
  });
  input.addEventListener("change", finishEdit);
  input.addEventListener("blur", finishEdit);
}
element("tilt").addEventListener("click", () =>
  edit(() => {
    const object = current();
    if (object)
      object.rotation[0] = (object.rotation[0] + Math.PI / 4) % (2 * Math.PI);
  }),
);
element("delete").addEventListener("click", () =>
  edit(() => {
    objects = objects.filter((o) => o.id !== selected);
    selected = null;
  }),
);
element("duplicate").addEventListener("click", () => {
  if (objects.length >= MAX_OBJECTS) {
    toast("立体は100個まで追加できます。");
    return;
  }
  edit(() => {
    const object = current();
    if (!object) return;
    const duplicate = structuredClone(object);
    duplicate.id = crypto.randomUUID();
    duplicate.position[0] = Math.min(10, duplicate.position[0] + 1);
    duplicate.position[1] = Math.min(10, duplicate.position[1] + 0.3);
    objects.push(duplicate);
    selected = duplicate.id;
  });
});
element("reset-view").addEventListener("click", () => {
  interruptHands();
  view.resetView();
});
element("fullscreen").addEventListener("click", () => {
  void (
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()
  ).catch(() => toast("全画面表示を開始できませんでした。"));
});
window.addEventListener("keydown", (event) => {
  if (viewerMode) {
    if (event.key === "Escape") setViewerMode(false);
    return;
  }
  if ((event.target as HTMLElement).matches("input, textarea, select")) return;
  if ((event.key === "Delete" || event.key === "Backspace") && current()) {
    event.preventDefault();
    element("delete").click();
  }
  if (event.key === "Escape") {
    interruptHands();
    setMenu(null);
    select(null);
  }
});

function pointerPosition(event: PointerEvent): { x: number; y: number } {
  const rect = viewport.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}
view.canvas.addEventListener("pointerdown", (event) => {
  if (viewerMode || event.button !== 0 || dragSource) return;
  hands.reset();
  finishEdit();
  const { x, y } = pointerPosition(event);
  const id = view.pick(x, y);
  if (id) {
    grab(id, x, y, "mouse");
    view.canvas.setPointerCapture(event.pointerId);
  } else select(null);
});
view.canvas.addEventListener("pointermove", (event) => {
  if (viewerMode) return;
  const { x, y } = pointerPosition(event);
  if (dragSource === "mouse") move(x, y);
  else if (!dragSource) view.hover(view.pick(x, y));
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  view.canvas.addEventListener(name, () => {
    if (dragSource === "mouse") release();
  });
view.canvas.addEventListener("pointerleave", () => {
  if (!dragSource) view.hover(null);
});
window.addEventListener("blur", interruptHands);
viewport.addEventListener("pointerdown", () => handMenu.reset());

function interruptHands(): void {
  handMenu.reset();
  release();
  hands.reset();
  cursor.hidden = true;
  viewCursor.hidden = true;
  viewCursor.classList.remove("grabbing");
  view.hover(null);
}

const handName = (side: "Left" | "Right") => side === "Left" ? "左手" : "右手";
function updateHandControls(): void {
  const viewportHand = handName(hands.viewportHand);
  const objectHand = handName(hands.objectHand);
  element("hand-roles").textContent = `${viewportHand}：視点 / ${objectHand}：立体・メニュー`;
  element("swap-hands").setAttribute("aria-pressed", String(hands.viewportHand === "Right"));
  element("view-cursor-label").textContent = `${viewportHand} · 視点`;
  element("object-cursor-label").textContent = `${objectHand} · 立体・メニュー`;
  element("howto-view").textContent = `${viewportHand}：視点`;
  element("howto-object").textContent = `${objectHand}：立体・メニュー`;
  const description = viewMode === "zoom"
    ? "つまんだまま上に動かすと拡大、下に動かすと縮小"
    : `つまんだまま動かすと視点が${viewMode === "orbit" ? "回転" : "平行移動"}`;
  element("view-gesture-help").textContent = `${viewportHand}で${description}。指を開くと止まります。`;
  document.querySelectorAll<HTMLButtonElement>("[data-view-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.viewMode === viewMode));
  });
  element("camera-message").textContent = "親指と人差し指をつまんで操作します。";
}
element("swap-hands").addEventListener("click", () => {
  interruptHands();
  hands.setViewportHand(hands.objectHand);
  try {
    localStorage.setItem(handPreferenceKey, hands.viewportHand);
  } catch { /* The setting remains usable for this session. */ }
  updateHandControls();
  toast(`${handName(hands.viewportHand)}で視点、${handName(hands.objectHand)}で立体・メニューを操作します。指を開いてからつまんでください。`);
});
document.querySelectorAll<HTMLButtonElement>("[data-view-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    interruptHands();
    viewMode = button.dataset.viewMode as ViewMode;
    updateHandControls();
  });
});
updateHandControls();

function drawLandmarks(detected: DetectedHand[]): void {
  const canvas = element<HTMLCanvasElement>("landmarks");
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const connections = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [5, 9, 10, 11, 12],
    [9, 13, 14, 15, 16],
    [13, 17, 18, 19, 20],
    [0, 17],
  ];
  context.lineWidth = 2;
  for (const hand of detected) {
    const points = hand.landmarks;
    if (points.length !== 21) continue;
    context.strokeStyle = hand.side === hands.viewportHand ? "#f3c580" : "#8bb9f5";
    for (const chain of connections) {
      context.beginPath();
      chain.forEach((i, n) => {
        const x = points[i].x * canvas.width;
        const y = points[i].y * canvas.height;
        if (n === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    for (const point of points) {
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, 2.5, 0, Math.PI * 2);
      context.fillStyle = "#fff";
      context.fill();
    }
    context.save();
    context.translate(points[0].x * canvas.width, points[0].y * canvas.height);
    context.scale(-1, 1); // Preview canvas is mirrored; keep its labels readable.
    context.fillStyle = context.strokeStyle;
    context.font = "14px sans-serif";
    context.fillText(`${handName(hand.side)} · ${hand.side === hands.viewportHand ? "視点" : "立体"}`, 5, -8);
    context.restore();
  }
}
function showHandCursor(node: HTMLElement, gesture: Gesture | null): void {
  node.hidden = !gesture;
  if (gesture) {
    node.style.left = `${gesture.x * 100}%`;
    node.style.top = `${gesture.y * 100}%`;
  }
}
function processHand(detected: DetectedHand[]): void {
  if (viewerMode) return;
  drawLandmarks(detected);
  const frame = hands.update(
    detected,
    video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1,
  );
  const gesture = frame.object;
  showHandCursor(cursor, gesture);
  showHandCursor(viewCursor, frame.viewport);
  const navigating = !!frame.viewport?.pinching && dragSource !== "mouse";
  viewCursor.classList.toggle("grabbing", navigating);
  if (cameraState === "on") {
    element("camera-status").textContent = [
      frame.viewport ? `${handName(hands.viewportHand)}：視点` : "",
      gesture ? `${handName(hands.objectHand)}：立体` : "",
    ].filter(Boolean).join(" / ") || "手を探しています";
    element("interaction-hint").textContent = navigating
      ? `${handName(hands.viewportHand)}で視点操作中 · 指を開くと止まります`
      : `${handName(hands.viewportHand)}：視点 / ${handName(hands.objectHand)}：立体・メニュー`;
  }
  // Camera movement has priority over hand object movement. Releasing first
  // keeps the object drag plane from jumping when the camera changes.
  if (navigating) {
    handMenu.reset();
    if (dragSource === "hand") release();
    view.hover(null);
    if (frame.navigation) view.navigate(viewMode, frame.navigation.dx, frame.navigation.dy);
    return;
  }
  if (dragSource !== "mouse" && dragSource !== "hand") {
    if (handMenu.update(gesture, frame.grab)) {
      view.hover(null);
      if (cameraState === "on")
        element("interaction-hint").textContent = "つまむ：決定 / バーを左右に動かす：調整";
      return;
    }
  }
  if (!gesture) {
    if (dragSource === "hand") release();
    view.hover(null);
    return;
  }
  if (dragSource !== "mouse") {
    const hit = view.pick(gesture.x, gesture.y);
    if (!dragSource) {
      view.hover(hit);
    }
    if (frame.grab && hit)
      grab(hit, gesture.x, gesture.y, "hand");
    if (dragSource === "hand") {
      if (gesture.pinching) move(gesture.x, gesture.y);
      else release();
    }
  }
}
function cameraOff(message?: string): void {
  interruptHands();
  cameraState = "off";
  cameraButton.disabled = false;
  cameraButton.textContent = "カメラを開始";
  element("camera-status").textContent = "停止中";
  element("camera-placeholder").hidden = false;
  element("camera-message").textContent =
    message ?? "親指と人差し指をつまんで操作します。";
  element("interaction-hint").textContent = "ドラッグで移動";
}
const handCamera = new HandCamera(video, processHand, (message) => {
  cameraOff(message);
  if (!viewerMode) toast(message);
});
function setViewerMode(enabled: boolean): void {
  if (viewerMode === enabled) return;
  viewerMode = enabled;
  interruptHands();
  setMenu(null);
  sceneSync?.setRole(enabled ? "viewer" : "editor");
  if (enabled) {
    handCamera.stop();
    cameraOff();
    select(null);
  }
  view.setViewer(enabled);
  document.body.classList.toggle("viewer-mode", enabled);
  const button = element<HTMLButtonElement>("viewer-mode");
  button.textContent = enabled ? "Editorに戻る" : "Viewer";
  button.setAttribute("aria-pressed", String(enabled));
  const url = new URL(location.href);
  if (enabled) url.searchParams.set("mode", "viewer");
  else url.searchParams.delete("mode");
  window.history.replaceState(null, "", url);
}
element("viewer-mode").addEventListener("click", () => setViewerMode(!viewerMode));
cameraButton.addEventListener("click", () => {
  if (viewerMode) return;
  if (cameraState === "on") {
    handCamera.stop();
    cameraOff();
    return;
  }
  cameraState = "starting";
  cameraButton.disabled = true;
  cameraButton.textContent = "準備しています…";
  element("camera-status").textContent = "準備中";
  element("camera-message").textContent =
    "カメラの使用を許可してください。初回の準備には少し時間がかかります。";
  void handCamera
    .start()
    .then(() => {
      if (viewerMode) {
        handCamera.stop();
        return;
      }
      cameraState = "on";
      cameraButton.disabled = false;
      cameraButton.textContent = "カメラを停止";
      element("camera-placeholder").hidden = true;
      element("camera-status").textContent = "手を探しています";
      element("camera-message").textContent =
        "親指と人差し指をつまんで操作します。";
      viewport.scrollIntoView({ block: "nearest" });
    })
    .catch((error) => {
      if (viewerMode) return;
      const message =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
          ? "カメラの使用が許可されていません。ブラウザのカメラ設定を確認してください。"
          : error instanceof DOMException && error.name === "NotFoundError"
            ? "カメラが見つかりません。接続してからもう一度試してください。"
            : error instanceof DOMException && error.name === "NotReadableError"
              ? "カメラを使用できません。他のアプリで使用していないか確認してください。"
              : error instanceof Error
                ? error.message
                : "カメラを開始できませんでした。";
      cameraOff(message);
      toast(message);
    });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    release();
    handCamera.stop();
    cameraOff();
  }
});
window.addEventListener("pagehide", () => {
  release();
  sceneSync?.close();
  handCamera.stop();
  view.dispose();
});

element("export").addEventListener("click", () => {
  release();
  const url = URL.createObjectURL(
    new Blob([serializeScene(objects)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `tenohira-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("作品をファイルに保存しました。");
});
element("import").addEventListener("click", () =>
  element<HTMLInputElement>("file").click(),
);
element<HTMLInputElement>("file").addEventListener("change", async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error("作品ファイルが大きすぎます。");
    const loaded = parseScene(await file.text());
    edit(() => {
      objects = loaded;
      selected = null;
    });
    toast("作品を開きました。");
  } catch {
    toast(
      "作品を開けませんでした。このアトリエで保存したJSONファイルを選んでください。",
    );
  } finally {
    input.value = "";
  }
});
sync();
if (new URLSearchParams(location.search).get("mode") === "viewer") setViewerMode(true);
const syncUrl = new URL("/sync", location.href);
syncUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
sceneSync = new SceneSync({
  url: syncUrl.href,
  room,
  role: viewerMode ? "viewer" : "editor",
  initial: objects,
  onScene(incoming, initialized) {
    // Applying a server state must never send it back as a new edit.
    if (selected && !incoming.some((object) => object.id === selected)) {
      pendingSave = false;
      release();
      selected = null;
    }
    objects = incoming;
    sync();
    if (initialized) persist();
  },
  onStatus(status) {
    const node = element("sync-status");
    node.dataset.state = status;
    node.textContent = {
      connecting: "接続中…",
      connected: "",
      waiting: "Editor接続待ち",
      reconnecting: "再接続中…",
    }[status];
  },
  onError: toast,
});
if (storageFailed)
  toast(
    "前の作品を読み込めませんでした。「作品を保存」でファイルに保存できます。",
  );
