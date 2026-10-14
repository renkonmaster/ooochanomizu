import type { Landmark } from "./gesture";

export class HandCamera {
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private frame = 0;
  private lastVideoTime = -1;
  private lastSent = 0;
  private busy = false;
  private session = 0;
  private rejectStart: ((reason: Error) => void) | null = null;

  constructor(
    private video: HTMLVideoElement,
    private onLandmarks: (points: Landmark[] | undefined) => void,
    private onError: (message: string) => void,
  ) {}

  async start(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "カメラには localhost または HTTPS でアクセスしてください。",
      );
    this.stop();
    const session = this.session;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
      audio: false,
    });
    if (session !== this.session) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("カメラの開始を中止しました。");
    }
    this.stream = stream;
    this.video.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (session === this.session) {
        this.stop();
        this.onError("カメラとの接続が切れました。もう一度開始してください。");
      }
    });
    try {
      await this.video.play();
      if (session !== this.session)
        throw new Error("カメラの開始を中止しました。");
      const worker = new Worker(new URL("./hand.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker = worker;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () =>
            reject(
              new Error(
                "手の認識の準備がタイムアウトしました。再試行してください。",
              ),
            ),
          45000,
        );
        const done = (error?: Error) => {
          clearTimeout(timeout);
          this.rejectStart = null;
          if (error) reject(error);
          else resolve();
        };
        this.rejectStart = (error) => done(error);
        worker.onerror = () =>
          done(
            new Error(
              "手の認識を起動できませんでした。ブラウザを更新して再試行してください。",
            ),
          );
        worker.onmessage = (event) => {
          if (session !== this.session) return;
          if (event.data.type === "ready") done();
          else if (event.data.type === "error")
            done(new Error("手の認識モデルを読み込めませんでした。"));
        };
        const base = new URL(import.meta.env.BASE_URL, location.href);
        worker.postMessage({
          type: "init",
          wasmPath: new URL("vision", base).href,
          modelPath: new URL("models/hand_landmarker.task", base).href,
        });
      });
      if (session !== this.session)
        throw new Error("カメラの開始を中止しました。");
      worker.onmessage = (event) => {
        if (session !== this.session) return;
        this.busy = false;
        if (event.data.type === "result")
          this.onLandmarks(event.data.landmarks);
        else if (event.data.type === "error") {
          this.stop();
          this.onError("手の認識が停止しました。カメラを再起動してください。");
        }
      };
      worker.onerror = () => {
        if (session === this.session) {
          this.stop();
          this.onError("手の認識が停止しました。カメラを再起動してください。");
        }
      };
      this.tick(session);
    } catch (error) {
      if (session === this.session) this.stop();
      throw error;
    }
  }

  private tick = (session: number): void => {
    if (session !== this.session) return;
    this.frame = requestAnimationFrame(() => this.tick(session));
    const now = performance.now();
    if (
      this.busy ||
      this.video.readyState < 2 ||
      this.video.currentTime === this.lastVideoTime ||
      now - this.lastSent < 50
    )
      return;
    this.busy = true;
    this.lastVideoTime = this.video.currentTime;
    this.lastSent = now;
    void createImageBitmap(this.video)
      .then((bitmap) => {
        if (session !== this.session || !this.worker) {
          bitmap.close();
          return;
        }
        this.worker.postMessage({ type: "frame", bitmap, timestamp: now }, [
          bitmap,
        ]);
      })
      .catch(() => {
        if (session === this.session) {
          this.stop();
          this.onError(
            "カメラ映像を取得できませんでした。再試行してください。",
          );
        }
      });
  };

  stop(): void {
    this.session++;
    cancelAnimationFrame(this.frame);
    this.rejectStart?.(new Error("カメラの開始を中止しました。"));
    this.rejectStart = null;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.busy = false;
    this.lastVideoTime = -1;
    this.onLandmarks(undefined);
  }
}
