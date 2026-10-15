import { describe, expect, it } from "vitest";
import {
  HandInteraction,
  PinchTracker,
  readHands,
  type DetectedHand,
  type HandSide,
  type Landmark,
} from "./gesture";

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

function detected(side: HandSide, ratio = 0.6, x = 0.4): DetectedHand {
  const landmarks = hand(ratio).map((p) => ({ ...p, x: p.x + x - 0.4 }));
  return { side, landmarks, score: 0.95 };
}

describe("hand roles", () => {
  it("routes the left hand to the viewport and the right hand to objects", () => {
    const interaction = new HandInteraction();
    const left = detected("Left", 0.6, 0.7);
    const right = detected("Right", 0.6, 0.2);
    const first = interaction.update([left, right]);
    const reordered = interaction.update([right, left]);
    expect(first.viewport!.x).toBeLessThan(first.object!.x);
    expect(reordered).toEqual(first);
    expect(interaction.update([left]).object).toBeNull();
    expect(interaction.update([right]).viewport).toBeNull();
  });

  it("starts viewport motion only after pinching, then stops on release or loss", () => {
    const interaction = new HandInteraction();
    expect(interaction.update([detected("Left")]).navigation).toBeNull();
    expect(interaction.update([detected("Left", 0.2)]).navigation).toBeNull();
    const moving = interaction.update([detected("Left", 0.2, 0.5)]);
    expect(moving.navigation!.dx).toBeLessThan(0);
    expect(moving.grab).toBe(false);
    expect(interaction.update([detected("Left")]).navigation).toBeNull();
    interaction.update([detected("Left", 0.2)]);
    interaction.update([detected("Left", 0.2, 0.6)]);
    expect(interaction.update([]).navigation).toBeNull();
    expect(interaction.update([detected("Left", 0.2, 0.1)]).navigation).toBeNull();
  });

  it("keeps pinch history independent for both hands", () => {
    const interaction = new HandInteraction();
    interaction.update([detected("Left", 0.2), detected("Right")]);
    const frame = interaction.update([detected("Right"), detected("Left", 0.4)]);
    expect(frame.viewport!.pinching).toBe(true);
    expect(frame.object!.pinching).toBe(false);
    interaction.update([detected("Left"), detected("Right")]);
    expect(interaction.update([detected("Right", 0.2)]).grab).toBe(true);
    expect(interaction.update([detected("Right", 0.2)]).grab).toBe(false);
  });

  it("prioritizes viewport motion and requires a new pinch to grab afterward", () => {
    const interaction = new HandInteraction();
    interaction.update([detected("Left"), detected("Right")]);
    expect(interaction.update([detected("Left", 0.2), detected("Right", 0.2)]).grab).toBe(false);
    expect(interaction.update([detected("Right", 0.2)]).grab).toBe(false);
    interaction.update([detected("Right")]);
    expect(interaction.update([detected("Right", 0.2)]).grab).toBe(true);
  });

  it("swaps both roles and prevents a held pinch from jumping across roles", () => {
    const interaction = new HandInteraction();
    interaction.update([detected("Left", 0.2), detected("Right", 0.2)]);
    interaction.setViewportHand("Right");
    expect(interaction.viewportHand).toBe("Right");
    expect(interaction.objectHand).toBe("Left");
    for (const x of [0.4, 0.5]) {
      const frame = interaction.update([detected("Left", 0.2, x), detected("Right", 0.2, x)]);
      expect(frame.grab).toBe(false);
      expect(frame.navigation).toBeNull();
    }
    interaction.update([detected("Left"), detected("Right")]);
    expect(interaction.update([detected("Left", 0.2)]).grab).toBe(true);
    interaction.update([detected("Right", 0.2)]);
    expect(interaction.update([detected("Right", 0.2, 0.5)]).navigation).not.toBeNull();
    interaction.setViewportHand("Left");
    expect(interaction.objectHand).toBe("Right");
  });

  it("requires opening fingers after interrupting an operation", () => {
    const interaction = new HandInteraction();
    interaction.update([detected("Left", 0.2), detected("Right", 0.2)]);
    interaction.reset();
    interaction.update([]);
    interaction.update([detected("Left", 0.2), detected("Right", 0.2)]);
    const frame = interaction.update([detected("Left", 0.2, 0.5), detected("Right", 0.2)]);
    expect(frame.navigation).toBeNull();
    expect(frame.grab).toBe(false);
  });

  it("uses the higher-confidence result when two detections claim the same hand", () => {
    const interaction = new HandInteraction();
    const weaker = { ...detected("Left", 0.2, 0.8), score: 0.7 };
    const stronger = detected("Left", 0.6, 0.2);
    const frame = interaction.update([weaker, stronger]);
    expect(frame.viewport!.pinching).toBe(false);
    expect(frame.viewport!.x).toBeCloseTo(0.74);
    expect(frame.object).toBeNull();
  });
});

describe("MediaPipe hand results", () => {
  it("pairs landmarks with anatomical handedness without inverting unmirrored input", () => {
    const left = hand(0.2);
    const right = hand(0.6);
    expect(readHands({
      landmarks: [right, left],
      handedness: [[{ categoryName: "Right", score: 0.99 }], [{ categoryName: "Left", score: 0.98 }]],
    })).toEqual([
      { side: "Right", landmarks: right, score: 0.99 },
      { side: "Left", landmarks: left, score: 0.98 },
    ]);
  });

  it("ignores missing, unknown, and low-confidence classifications", () => {
    expect(readHands({
      landmarks: [hand(0.2), hand(0.2), hand(0.2), hand(0.2)],
      handedness: [[], [{ categoryName: "Unknown", score: 1 }], [{ categoryName: "Left", score: 0.55 }], [{ categoryName: "Right", score: NaN }]],
    })).toEqual([]);
    expect(readHands({ landmarks: [], handedness: [] })).toEqual([]);
  });
});
