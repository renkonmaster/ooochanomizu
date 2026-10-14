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
