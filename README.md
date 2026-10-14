# てのひらアトリエ

Webカメラと手の動きで立体を組み合わせる、3D創作ワークショップです。
`spec.md` の開発順序①〜③に対応する、1台・1ブラウザでのMVPを実装しています。

## 起動

Node.jsのバージョンは [mise](https://mise.jdx.dev/) で `mise.toml` に固定しています。

```sh
mise install
npm ci
npm run dev
```

miseを使わない場合は、`mise.toml` と同じバージョンのNode.js（22.15以上が必須）を用意してください。

表示された `http://127.0.0.1:5173` をブラウザで開きます。
初回起動時にGoogle公式のHand Landmarkerモデル（約8 MB）を取得します。
WASMとモデルは `public/` に配置され、以後はローカルから読み込みます。
モデル取得後は、開発・ビルド・ハンドトラッキングに外部CDNへのアクセスは不要です。
カメラ映像とランドマークはサーバーへ送信しません。

## 操作

- 「かたちを追加」でCube / Sphere / Cylinder / Cone / Torusを追加します。
- 「カメラをはじめる」を押し、カメラ使用を許可します。
- 片手を映すと、親指と人差し指の中点に対応するカーソルが表示されます。
- 立体に合わせ、親指と人差し指をつまむと掴めます。そのまま動かし、指を開くと離します。
- 手が見えなくなる、タブを離れる、カメラを止める場合にも掴んだ立体を離します。
- カメラなしでも、立体を左ドラッグ（タッチでは1本指）して移動できます。
- 右ドラッグで視点を回転、スクロールでズーム。「視点を戻す」で初期視点に戻します。
- 選択した立体の色・大きさ・奥行き・横回転をUIで変更できます。「たてに回す」は45°ずつ回します。
- 削除、複製、Undo / Redoに対応。`Ctrl+Z` / `Ctrl+Shift+Z`、`Delete`、`Escape`も利用できます。
- 移動はカメラに平行な平面上で行い、細かな奥行き調整はスライダーを使用します。
- 最大100個。操作履歴は50件まで、ドラッグ／スライダー操作はまとめて1件に記録します。

作品は同じブラウザのlocalStorageに自動保存します。「作品を保存／開く」でJSONファイルとして持ち運べます。
読み込みもUndoできます。自動保存はブラウザ・ポートごとで、他のタブや端末とは共有しません。
作品保存は試作確認用の補助機能です。Galleryは未実装です。

## 検証・ビルド

```sh
npm run check
npm test
npm run build
npm run preview
```

`dist/` が静的配信用の成果物です。モデルとWASMも含まれます。
通常の配信ではHTTPSが必要です（localhostはHTTPでもカメラ利用可）。
展示PCではChrome / Edgeの現行版、WebGL、カメラ権限を確認してください。
推論はCPUを使うWeb Workerで最大20fpsに抑え、描画と分離しています。

型チェック、17件のユニットテスト、本番ビルド、ブラウザでの立体編集とUndo、
開発版・本番ビルド両方で、実際のローカルモデルのロードとWorker内推論を確認しています。
開発サーバーの `/tests/hand-worker.html` でモデルの動作をカメラなしで再検証できます。
実際のWebカメラでの手の認識・操作感、複数の画面サイズ、展示PC上の性能は引き続き確認が必要です。

## 構成

- `src/main.ts`: 日本語UI、操作の接続、履歴、自動保存、ファイル入出力
- `src/scene.ts`: Three.js表示、選択、ドラッグ、視点操作
- `src/gesture.ts`: 手の座標、ピンチ判定、平滑化
- `src/hand.ts` / `src/hand.worker.ts`: カメラ、モデル準備、端末内推論、リソース解放
- `src/model.ts`: シーンデータ、履歴、保存データの検証
- `scripts/prepare-assets.mjs`: ローカルWASMと公式モデルの準備

## 次の段階

Room / WebSocketサーバーとDisplay専用画面は未実装です。
仕様の開発順序④〜⑥として、以下を追加します。

1. Room作成・参加と `/room/{roomId}/input` の導線。
2. サーバーを正とするシーン同期。現在の `SceneObject` を基に操作結果のみ送信。
3. 同時操作時のObjectロック、切断時の解放、再接続時の全シーン取得。
4. `/room/{roomId}/display`（カメラなし、表示のみ）。
5. NeoShowcase向けの配信設定、複数PC・大型画面での検証。

実機でピンチのしきい値、移動の感度、手の認識速度を確認してから、Z移動・回転・拡縮のジェスチャー方式を決めます。

## Git

`main` ブランチで管理しています。依存関係は `package-lock.json` に固定しています。
`node_modules/`、`dist/`、取得したモデル／WASM、環境変数ファイルはGit管理対象外です。
リモートリポジトリは未設定です。

## 参照

- [仕様](spec.md) / [概要](about.md)
- [MediaPipe公式 Webガイド](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Three.js Raycaster](https://threejs.org/docs/pages/Raycaster.html)
- [Viteセットアップ](https://vite.dev/guide/)

公式モデルおよびMediaPipeの利用条件は配布元のライセンスに従ってください。
