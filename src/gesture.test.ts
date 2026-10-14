import { describe, expect, it } from "vitest";
import { PinchTracker, type Landmark } from "./gesture";

function hand(ratio: number): Landmark[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[0].y = 0.8;
  points[9].y = 0.6;
  points[4] = { x: 0.4, y: 0.4, z: 0 };
  points[8] = { x: 0.4 + ratio * 0.2, y: 0.4, z: 0 };
  return points;
}

describe("pinch gestures", () => {
  it("requires a closed pinch to grab and a wider opening to release", () => {
    const tracker = new PinchTracker();
    expect(tracker.update(hand(0.4))!.pinching).toBe(false);
    expect(tracker.update(hand(0.2))!.pinching).toBe(true);
    expect(tracker.update(hand(0.4))!.pinching).toBe(true);
    expect(tracker.update(hand(0.6))!.pinching).toBe(false);
  });
  it("releases and resets smoothing when a hand disappears", () => {
    const tracker = new PinchTracker();
    tracker.update(hand(0.2));
    expect(tracker.update(undefined)).toBeNull();
    expect(tracker.update(hand(0.4))!.pinching).toBe(false);
  });
  it("mirrors camera input and keeps coordinates inside the canvas", () => {
    const tracker = new PinchTracker();
    const gesture = tracker.update(hand(0.2))!;
    expect(gesture.x).toBeCloseTo(0.58);
    expect(gesture.y).toBeCloseTo(0.4);
  });
  it("rejects malformed or too-small palms instead of accidentally grabbing", () => {
    const tracker = new PinchTracker();
    expect(tracker.update([])).toBeNull();
    const points = hand(0.2);
    points[9] = { ...points[0] };
    expect(tracker.update(points)).toBeNull();
    points[9].x = NaN;
    expect(tracker.update(points)).toBeNull();
  });
  it("makes the same decision across hand sizes and camera aspect ratios", () => {
    const small = hand(0.2).map((p) => ({ ...p, x: p.x * 0.5, y: p.y * 0.5 }));
    expect(new PinchTracker().update(small)!.pinching).toBe(true);
    expect(new PinchTracker().update(hand(0.2), 4 / 3)!.pinching).toBe(true);
  });
});
