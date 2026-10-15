import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { readHands } from "./gesture";

let detector: HandLandmarker | null = null;
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  try {
    if (data.type === "init") {
      // Module workers need the ESM WASM loader (the classic loader keeps its
      // factory in module scope and cannot initialize MediaPipe here).
      const vision = await FilesetResolver.forVisionTasks(data.wasmPath, true);
      detector = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: data.modelPath, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame" && detector) {
      try {
        const result = detector.detectForVideo(data.bitmap, data.timestamp);
        self.postMessage({ type: "result", hands: readHands(result) });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
