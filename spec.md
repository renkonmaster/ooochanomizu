# ハンドトラッキング3D創作ワークショップ 設計案

1. 概要

Webカメラによるハンドトラッキングを利用し、手の動きで3Dオブジェクトを操作できる創作ワークショップを制作する。

Cube・Sphere・Cylinderなどのプリミティブを、

- 追加
- 掴む
- 移動
- 回転
- 拡大縮小
- 削除

して、自由に3D作品を制作する。

特定のお題や完成目標は設けず、3Dのお絵描きキャンバスのような体験を目指す。

2. 操作

基本操作は以下とする。

操作| 方法
カーソル移動| 手・指の移動
選択| オブジェクトを指す
Grab / Release| Pinch
Move| Grabした状態で手を移動
Rotate| 未定
Scale| 未定

Primitive追加・色変更・Deleteなどは必要に応じて画面UIを使用する。

ジェスチャーだけで操作することにはこだわらず、初見で操作できることを優先する。

3. 構成

制作PCを2台使用し、そのうち1台を大型画面への出力にも使用する。

                  NeoShowcase
                       │
             ┌─────────┴─────────┐
             │                   │
           PC A                PC B
       Input + Camera       Input + Camera
             │
          Display
             │
        大型スクリーン

PC AではInputとDisplayの2タブを開く。

Webカメラ映像は送信せず、ハンドトラッキングは各Input端末で処理する。

4. Room

同じRoomに参加したInput / Displayで同じ3D空間を共有する。

Room K7DX
├── PC A / Input
├── PC A / Display
└── PC B / Input

URLによって役割を分ける。

/room/{roomId}/input
/room/{roomId}/display

Input

- Webcam
- Hand Tracking
- Gesture Recognition
- 3D操作

Display

- 共有3D空間の表示のみ
- Webcam / Hand Trackingは使用しない

5. セットアップ

PC A

URLを開く
→ Room作成
→ Inputとして参加
→ Displayを別タブで開く
→ Displayを大型スクリーンへ全画面表示

PC B

URLを開く
→ Room IDを入力
→ Inputとして参加

6. 技術構成

Client

- TypeScript
- Vite
- Three.js
- MediaPipe Hand Landmarker

Webcam
→ MediaPipe
→ Gesture
→ 3D Interaction
→ Three.js

Server

NeoShowcase上に配置する。

- Room管理
- Scene状態管理
- WebSocketによるリアルタイム同期

カメラ映像やHand Landmarkは送信せず、オブジェクトの生成・移動・回転などの操作結果だけを同期する。

7. 開発順序

① Hand Tracking
        ↓
② CubeをPinchでGrab / Move / Release
        ↓
③ Primitive追加・Rotate・Scaleなど
        ↓
④ Room / WebSocket
        ↓
⑤ Display
        ↓
⑥ 展示向け安定化

まず1台だけで創作体験が成立するところまで完成させる。

複数PC・Room・Displayはその後に追加する。

8. 未確定事項

実際にHand Trackingを動かしてから決める。

- Z方向の移動方法
- Rotate
- Scale
- Primitiveの種類
- 色変更などのUI
- 複数人が同じObjectを操作した場合の扱い
- 作品保存 / Galleryの有無
