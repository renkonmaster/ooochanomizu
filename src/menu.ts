import { COLORS, LABELS, type Primitive } from "./model";

const shapes: Record<Primitive, string> = {
  cube: '<path d="m16 3 12 7v13l-12 7-12-7V10Z M4 10l12 7 12-7 M16 17v13"/>',
  sphere: '<circle cx="16" cy="16" r="12"/><ellipse cx="16" cy="16" rx="5" ry="12"/><path d="M4 16h24"/>',
  cylinder: '<ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v18c0 5 22 5 22 0V7 M5 25c0-5 22-5 22 0"/>',
  cone: '<path d="M5 25 16 3l11 22 M5 25c0-6 22-6 22 0s-22 6-22 0Z"/>',
  torus: '<ellipse cx="16" cy="16" rx="13" ry="10"/><ellipse cx="16" cy="14" rx="6" ry="4"/>',
};
const colorLabels = ["ミント", "コーラル", "きいろ", "ブルー", "ラベンダー", "ホワイト"];
const heading = (title: string) => `<div class="menu-heading"><h2>${title}</h2><button class="menu-close" data-menu-close aria-label="メニューを閉じる">×</button></div>`;

export const atelierMenu = `

  <aside class="viewport-controls" data-hand-surface aria-label="創作ツール">
    <div class="viewport-toolbar">
      <div class="view-actions">
      <button id="viewer-mode" class="menu-action" aria-pressed="false">Viewer</button>
      <button id="reset-view" class="menu-action">視点を戻す</button>
      <button id="fullscreen" class="menu-action" aria-label="全画面にする">⛶</button>
      </div>
    </div>
    <nav class="viewport-dock" aria-label="創作メニュー">
      <button data-menu="add" aria-controls="menu-add" aria-expanded="false"><span aria-hidden="true">＋</span>追加</button>
      <button data-menu="color" aria-controls="menu-color" aria-expanded="false"><span class="color-icon" aria-hidden="true"></span>色</button>
      <button data-menu="edit" aria-controls="menu-edit" aria-expanded="false">編集</button>
      <button data-menu="view" aria-controls="menu-view" aria-expanded="false" aria-label="視点・左右">視点</button>
    </nav>
  <section id="menu-add" class="viewport-panel" data-hand-surface aria-label="形を追加" hidden>
    ${heading("立体を追加")}
    <p class="menu-help">種類を選択して追加します。</p>
    <div class="primitive-grid" role="group" aria-label="追加する形">${Object.entries(LABELS).map(([kind, label]) => `
      <button class="primitive" data-kind="${kind}" aria-pressed="${kind === "cube"}"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${shapes[kind as Primitive]}</svg><span>${label}</span></button>`).join("")}
    </div>
    <button id="add-object" class="menu-primary">キューブを追加</button>
  </section>
  <section id="menu-color" class="viewport-panel" data-hand-surface aria-label="色" hidden>
    ${heading("色")}
    <p id="color-target" class="menu-help">次に追加する立体の色</p>
    <div class="palette" role="group" aria-label="色">${COLORS.map((color, i) => `<button class="swatch" data-color="${color}" style="--swatch:${color}" aria-label="${colorLabels[i]}" aria-pressed="${i === 0}"><span>${colorLabels[i]}</span></button>`).join("")}</div>
    <button id="clear-selection" class="menu-action">選択を解除</button>
  </section>
  <section id="menu-edit" class="viewport-panel" data-hand-surface aria-label="立体を編集" hidden>
    <div class="menu-heading"><div><h2>編集</h2><p id="selection-name" class="selection-name">未選択</p></div><button class="menu-close" data-menu-close aria-label="メニューを閉じる">×</button></div>
    <fieldset id="transform" disabled>
      <label class="range-label" for="scale">大きさ <output id="scale-value">1.00×</output></label><input id="scale" type="range" min="0.25" max="3" step="0.05" value="1">
      <label class="range-label" for="depth">奥行き <output id="depth-value">0.0</output></label><input id="depth" type="range" min="-6" max="6" step="0.1" value="0">
      <label class="range-label" for="rotate">横回転 <output id="rotate-value">0°</output></label><input id="rotate" type="range" min="-180" max="180" step="5" value="0">
      <div class="rotate-actions"><button id="tilt" class="menu-action">縦に45°回転</button><button id="duplicate" class="menu-action">複製</button></div>
      <button id="delete" class="delete-button">削除</button>
    </fieldset>
  </section>
  <section id="menu-view" class="viewport-panel" data-hand-surface aria-label="視点と手の設定" hidden>
    ${heading("視点・左右")}
    <div class="view-modes" role="group" aria-label="手での視点操作"><button class="menu-action" data-view-mode="orbit" aria-pressed="true">回転</button><button class="menu-action" data-view-mode="pan" aria-pressed="false">平行移動</button><button class="menu-action" data-view-mode="zoom" aria-pressed="false">ズーム</button></div>
    <p id="view-gesture-help" class="menu-help"></p>
    <p id="hand-roles" aria-live="polite">左手：視点 / 右手：立体・メニュー</p>
    <button id="swap-hands" class="menu-action" aria-label="視点操作を右手にする" aria-pressed="false">左右を入れ替える</button>
  </section>
  </aside>`;
