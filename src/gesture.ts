import { clamp } from "./model";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}
export interface Gesture {
  x: number;
  y: number;
  pinching: boolean;
}

export type HandSide = "Left" | "Right";
export interface DetectedHand {
  side: HandSide;
  landmarks: Landmark[];
  score: number;
}

/** Tasks Vision labels the user's hands in unmirrored webcam frames.
 * Only the preview and cursor coordinates are mirrored, not inference input.
 */
export function readHands(result: {
  landmarks: Landmark[][];
  handedness: { categoryName: string; score: number }[][];
}): DetectedHand[] {
  return result.landmarks.flatMap((landmarks, index) => {
    const category = result.handedness[index]?.[0];
    if (
      !category ||
      (category.categoryName !== "Left" && category.categoryName !== "Right") ||
      !Number.isFinite(category.score) ||
      category.score < 0.6
    )
      return [];
    return [{ side: category.categoryName, landmarks, score: category.score }];
  });
}

export interface HandFrame {
  object: Gesture | null;
  viewport: Gesture | null;
  grab: boolean;
  navigation: { dx: number; dy: number } | null;
}

/** Keep smoothing and pinch edges per role, independent of detection order. */
export class HandInteraction {
  private objectPinch = new PinchTracker();
  private viewportPinch = new PinchTracker();
  private previousViewport: Gesture | null = null;
  private objectWasPinching = false;
  private waitForOpen = { object: false, viewport: false };

  constructor(public viewportHand: HandSide = "Left") {}

  get objectHand(): HandSide {
    return this.viewportHand === "Left" ? "Right" : "Left";
  }

  setViewportHand(side: HandSide): void {
    this.viewportHand = side;
    this.reset();
  }

  /** Interruptions require opening fingers before starting another operation. */
  reset(): void {
    this.objectPinch.reset();
    this.viewportPinch.reset();
    this.previousViewport = null;
    this.objectWasPinching = false;
    this.waitForOpen = { object: true, viewport: true };
  }

  update(hands: DetectedHand[], aspect = 1): HandFrame {
    const find = (side: HandSide) =>
      hands
        .filter((hand) => hand.side === side)
        .sort((a, b) => b.score - a.score)[0]?.landmarks;
    const object = this.objectPinch.update(find(this.objectHand), aspect);
    const viewport = this.viewportPinch.update(find(this.viewportHand), aspect);
    if (object && !object.pinching) this.waitForOpen.object = false;
    if (viewport && !viewport.pinching) this.waitForOpen.viewport = false;
    const navigation =
      viewport?.pinching &&
      this.previousViewport?.pinching &&
      !this.waitForOpen.viewport
        ? {
            dx: viewport.x - this.previousViewport.x,
            dy: viewport.y - this.previousViewport.y,
          }
        : null;
    const grab =
      !!object?.pinching &&
      !this.objectWasPinching &&
      !this.waitForOpen.object &&
      !viewport?.pinching;
    this.previousViewport = viewport;
    this.objectWasPinching = object?.pinching ?? false;
    return { object, viewport, grab, navigation };
  }
}

/** Palm-relative distances and separate thresholds avoid rapid grab/release flicker. */
export class PinchTracker {
  private pinching = false;
  private point: { x: number; y: number } | null = null;
  reset(): void {
    this.pinching = false;
    this.point = null;
  }
  update(landmarks: Landmark[] | undefined, aspect = 1): Gesture | null {
    if (
      !landmarks ||
      landmarks.length !== 21 ||
      landmarks.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    ) {
      this.reset();
      return null;
    }
    const distance = (a: Landmark, b: Landmark) =>
      Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const palm = distance(landmarks[0], landmarks[9]);
    if (palm < 0.025) {
      this.reset();
      return null;
    }
    const ratio = distance(landmarks[4], landmarks[8]) / palm;
    this.pinching = this.pinching ? ratio < 0.48 : ratio < 0.3;
    // The midpoint remains stable when the index finger closes toward the thumb.
    const x = clamp(1 - (landmarks[4].x + landmarks[8].x) / 2, 0, 1);
    const y = clamp((landmarks[4].y + landmarks[8].y) / 2, 0, 1);
    this.point = this.point
      ? {
          x: this.point.x + (x - this.point.x) * 0.4,
          y: this.point.y + (y - this.point.y) * 0.4,
        }
      : { x, y };
    return { ...this.point, pinching: this.pinching };
  }
}
