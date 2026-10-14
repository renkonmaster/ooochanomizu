import "./style.css";
import { AtelierScene } from "./scene";
import { HandCamera } from "./hand";
import { PinchTracker, type Landmark } from "./gesture";
import {
  COLORS,
  LABELS,
  MAX_OBJECTS,
  History,
  cloneScene,
  makeObject,
  parseScene,
  serializeScene,
  type Primitive,
  type SceneObject,
} from "./model";

const shapes: Record<Primitive, string> = {
  cube: '<path d="m16 3 12 7v13l-12 7-12-7V10Z M4 10l12 7 12-7 M16 17v13"/>',
  sphere:
    '<circle cx="16" cy="16" r="12"/><ellipse cx="16" cy="16" rx="5" ry="12"/><path d="M4 16h24"/>',
  cylinder:
    '<ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v18c0 5 22 5 22 0V7 M5 25c0-5 22-5 22 0"/>',
  cone: '<path d="M5 25 16 3l11 22 M5 25c0-6 22-6 22 0s-22 6-22 0Z"/>',
  torus:
    '<ellipse cx="16" cy="16" rx="13" ry="10"/><ellipse cx="16" cy="14" rx="6" ry="4"/>',
};
const svg = (kind: Primitive) =>
  `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${shapes[kind]}</svg>`;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="/" aria-label="てのひらアトリエ"><span class="brand-mark">✳</span><span>てのひら<span class="brand-light">アトリエ</span><small>HANDTRACKING · 3D WORKSHOP</small></span></a>
    <span class="local-badge"><i></i> ひとりで創作</span>
    <div class="top-actions"><button id="export" class="quiet">作品を保存 ↓</button><button id="import" class="quiet">作品を開く</button><input id="file" type="file" accept="application/json,.json" hidden></div>
  </header>
  <main class="workspace">
    <aside class="toolbox" aria-label="創作ツール">
      <div class="section-heading"><span class="eyebrow">LET’S MAKE SOMETHING</span><h1>手のひらから、<br>かたちにしよう。</h1><p>つかんで、動かして、組み合わせて。<br>ここは、立体のお絵かきキャンバス。</p></div>
      <section><div class="section-title"><h2>かたちを追加</h2><span>01</span></div><div class="primitive-grid">${Object.entries(
        LABELS,
      )
        .map(
          ([kind, label]) =>
            `<button class="primitive" data-kind="${kind}">${svg(kind as Primitive)}<span>${label}</span><span class="plus">＋</span></button>`,
        )
        .join("")}</div></section>
      <section><div class="section-title"><h2>色をえらぶ</h2><span>02</span></div><div class="palette" role="group" aria-label="色">${COLORS.map((color, i) => `<button class="swatch" data-color="${color}" style="--swatch:${color}" aria-label="${["ミント", "コーラル", "きいろ", "ブルー", "ラベンダー", "ホワイト"][i]}" aria-pressed="${i === 0}"></button>`).join("")}</div><p class="small-hint">選んだ立体、または次に追加する立体の色</p></section>
      <section id="inspector"><div class="section-title"><h2>かたちをととのえる</h2><span>03</span></div><p id="selection-name" class="selection-name">立体を選んでみよう</p><fieldset id="transform" disabled>
        <label class="range-label" for="scale">大きさ <output id="scale-value">1.00×</output></label><input id="scale" type="range" min="0.25" max="3" step="0.05" value="1">
        <label class="range-label" for="depth">奥行き <output id="depth-value">0.0</output></label><input id="depth" type="range" min="-6" max="6" step="0.1" value="0"><div class="range-ends"><span>奥へ</span><span>手前へ</span></div>
        <label class="range-label" for="rotate">回転 <output id="rotate-value">0°</output></label><input id="rotate" type="range" min="-180" max="180" step="5" value="0">
        <div class="rotate-actions"><button id="tilt" class="quiet">↻ たてに回す</button><button id="duplicate" class="quiet">＋ 複製</button></div>
        <button id="delete" class="delete-button">選んだ立体を削除</button>
      </fieldset></section>
      <div class="toolbox-footer"><span class="footer-dot"></span> 正解のない、ものづくり。</div>
    </aside>
    <section class="studio" aria-label="創作エリア">
      <div class="studio-toolbar"><div class="canvas-label"><span class="eyebrow">YOUR CANVAS</span><span id="object-count">3 つの立体</span></div><div class="view-actions"><button id="undo" class="icon-button" aria-label="元に戻す" title="元に戻す (Ctrl+Z)">↶</button><button id="redo" class="icon-button" aria-label="やり直す" title="やり直す (Ctrl+Shift+Z)">↷</button><span class="divider"></span><button id="reset-view" class="quiet">視点を戻す</button><button id="fullscreen" class="icon-button" aria-label="全画面にする" title="全画面">⛶</button></div></div>
      <div id="viewport" class="viewport"><div class="canvas-note"><span class="note-line"></span>小さなかたちから、自由に。</div><div id="hand-cursor" class="hand-cursor" hidden><span></span></div><div id="grab-pill" class="grab-pill" hidden>つかんでいます</div><div class="canvas-bottom"><span id="interaction-hint">立体をドラッグして動かそう</span><span class="view-hint">右ドラッグ：視点 · スクロール：ズーム</span></div></div>
      <div class="camera-strip"><div class="camera-preview"><video id="webcam" playsinline muted aria-label="カメラプレビュー"></video><canvas id="landmarks" width="320" height="240" aria-hidden="true"></canvas><span id="camera-placeholder">✋</span><span class="camera-tag">CAMERA</span></div><div class="camera-copy"><div class="camera-title"><h2>手でつくってみよう</h2><span id="camera-status" class="status-tag">カメラ OFF</span></div><p id="camera-message">親指と人差し指でつまむと、立体をつかめます。</p><span class="privacy-note">映像はこの端末の中だけで処理されます。</span></div><button id="camera-toggle" class="primary">カメラをはじめる <span>↗</span></button></div>
      <div class="howto" aria-label="手の使い方"><div><span class="step">1</span><p><strong>立体を指す</strong><span>手を動かしてカーソルを合わせる</span></p></div><span class="step-arrow">→</span><div><span class="step">2</span><p><strong>つまんで、動かす</strong><span>親指と人差し指をくっつける</span></p></div><span class="step-arrow">→</span><div><span class="step">3</span><p><strong>指をひらして、離す</strong><span>好きなところに置いてみよう</span></p></div></div>
    </section>
  </main><div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`;

const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const viewport = element<HTMLDivElement>("viewport");
const video = element<HTMLVideoElement>("webcam");
const cursor = element<HTMLDivElement>("hand-cursor");
const cameraButton = element<HTMLButtonElement>("camera-toggle");
const history = new History();
const pinch = new PinchTracker();
const storageKey = "tenohira-atelier.scene.v1";
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
let dragSource: "mouse" | "hand" | null = null;
let transaction: SceneObject[] | null = null;
let handWasPinching = false;
let cameraState: "off" | "starting" | "on" = "off";
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
  element("object-count").textContent = `${objects.length} つの立体`;
  element<HTMLButtonElement>("undo").disabled = !history.canUndo;
  element<HTMLButtonElement>("redo").disabled = !history.canRedo;
  element<HTMLFieldSetElement>("transform").disabled = !object;
  element("selection-name").textContent = object
    ? `${LABELS[object.kind]}を選択中`
    : "立体を選んでみよう";
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
function beginTransaction(): void {
  if (!transaction) transaction = cloneScene(objects);
}
function finishTransaction(): void {
  if (transaction) {
    history.commit(transaction, objects);
    transaction = null;
    persist();
    updateUI();
  }
}
function release(): void {
  dragSource = null;
  view.endDrag();
  cursor.classList.remove("grabbing");
  element("grab-pill").hidden = true;
  finishTransaction();
}
function edit(action: () => void): void {
  release();
  beginTransaction();
  action();
  sync();
  finishTransaction();
}
function grab(
  id: string,
  x: number,
  y: number,
  source: "mouse" | "hand",
): void {
  if (dragSource) return;
  select(id);
  if (!view.beginDrag(id, x, y)) return;
  beginTransaction();
  dragSource = source;
  element("grab-pill").hidden = false;
  cursor.classList.add("grabbing");
}
function move(x: number, y: number): void {
  const object = current();
  const position = view.drag(x, y);
  if (!object || !position) return;
  object.position = position;
  view.sync(objects);
}

document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((button) =>
  button.addEventListener("click", () => {
    if (objects.length >= MAX_OBJECTS) {
      toast("立体は100個までです。いくつか削除してみてください。");
      return;
    }
    edit(() => {
      const object = makeObject(
        button.dataset.kind as Primitive,
        activeColor,
        objects.length,
      );
      objects.push(object);
      selected = object.id;
    });
  }),
);
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
    if (dragSource) release();
    const object = current();
    if (!object) return;
    beginTransaction();
    const value = Number(input.value);
    if (id === "scale") object.scale = value;
    else if (id === "depth") object.position[2] = value;
    else object.rotation[1] = (value * Math.PI) / 180;
    view.sync(objects);
    updateUI();
  });
  input.addEventListener("change", finishTransaction);
  input.addEventListener("blur", finishTransaction);
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
    toast("立体は100個までです。");
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
function restore(direction: "undo" | "redo"): void {
  release();
  const snapshot = history[direction](objects);
  if (snapshot) {
    objects = snapshot;
    selected = null;
    sync();
    persist();
  }
}
element("undo").addEventListener("click", () => restore("undo"));
element("redo").addEventListener("click", () => restore("redo"));
element("reset-view").addEventListener("click", () => {
  release();
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
  if ((event.target as HTMLElement).matches("input, textarea, select")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    restore(event.shiftKey ? "redo" : "undo");
  }
  if ((event.key === "Delete" || event.key === "Backspace") && current()) {
    event.preventDefault();
    element("delete").click();
  }
  if (event.key === "Escape") {
    release();
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
  if (event.button !== 0 || dragSource) return;
  finishTransaction();
  const { x, y } = pointerPosition(event);
  const id = view.pick(x, y);
  if (id) {
    grab(id, x, y, "mouse");
    view.canvas.setPointerCapture(event.pointerId);
  } else select(null);
});
view.canvas.addEventListener("pointermove", (event) => {
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
window.addEventListener("blur", release);

function drawLandmarks(points: Landmark[] | undefined): void {
  const canvas = element<HTMLCanvasElement>("landmarks");
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;
  const connections = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [5, 9, 10, 11, 12],
    [9, 13, 14, 15, 16],
    [13, 17, 18, 19, 20],
    [0, 17],
  ];
  context.strokeStyle = "#aaf3d2";
  context.lineWidth = 2;
  for (const chain of connections) {
    context.beginPath();
    chain.forEach((i, n) => {
      const x = points[i].x * 320;
      const y = points[i].y * 240;
      if (n === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  for (const point of points) {
    context.beginPath();
    context.arc(point.x * 320, point.y * 240, 2.5, 0, Math.PI * 2);
    context.fillStyle = "#fff";
    context.fill();
  }
}
function processHand(points: Landmark[] | undefined): void {
  drawLandmarks(points);
  const gesture = pinch.update(
    points,
    video.videoWidth / (video.videoHeight || 1),
  );
  if (!gesture) {
    cursor.hidden = true;
    handWasPinching = false;
    if (dragSource === "hand") release();
    view.hover(null);
    if (cameraState === "on") {
      element("camera-status").textContent = "手を探しています";
      element("interaction-hint").textContent = "カメラに片手を映してみよう";
    }
    return;
  }
  cursor.hidden = false;
  cursor.style.left = `${gesture.x * 100}%`;
  cursor.style.top = `${gesture.y * 100}%`;
  element("camera-status").textContent = gesture.pinching
    ? "つまんでいます"
    : "手を認識中";
  element("interaction-hint").textContent =
    "立体に合わせて、親指と人差し指でつまもう";
  if (dragSource !== "mouse") {
    const hit = view.pick(gesture.x, gesture.y);
    if (!dragSource) {
      view.hover(hit);
      if (hit && !gesture.pinching) {
        finishTransaction();
        select(hit);
      }
    }
    if (gesture.pinching && !handWasPinching && hit)
      grab(hit, gesture.x, gesture.y, "hand");
    if (dragSource === "hand") {
      if (gesture.pinching) move(gesture.x, gesture.y);
      else release();
    }
  }
  handWasPinching = gesture.pinching;
}
function cameraOff(message?: string): void {
  cameraState = "off";
  cameraButton.disabled = false;
  cameraButton.textContent = "カメラをはじめる ↗";
  element("camera-status").textContent = "カメラ OFF";
  element("camera-placeholder").hidden = false;
  element("camera-message").textContent =
    message ?? "親指と人差し指でつまむと、立体をつかめます。";
  element("interaction-hint").textContent = "立体をドラッグして動かそう";
}
const handCamera = new HandCamera(video, processHand, (message) => {
  cameraOff(message);
  toast(message);
});
cameraButton.addEventListener("click", () => {
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
      cameraState = "on";
      cameraButton.disabled = false;
      cameraButton.textContent = "カメラを止める";
      element("camera-placeholder").hidden = true;
      element("camera-status").textContent = "手を探しています";
      element("camera-message").textContent =
        "片手を映して、立体にカーソルを合わせてみよう。";
    })
    .catch((error) => {
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
    toast("作品を開きました。元に戻すと前の作品に戻れます。");
  } catch {
    toast(
      "作品を開けませんでした。このアトリエで保存したJSONファイルを選んでください。",
    );
  } finally {
    input.value = "";
  }
});
sync();
if (storageFailed)
  toast(
    "前の作品を読み込めませんでした。「作品を保存」でファイルに保存できます。",
  );
