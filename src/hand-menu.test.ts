import { describe, expect, it } from "vitest";
import { rangeValueAt } from "./hand-menu";

describe("hand-controlled ranges", () => {
  it("maps hand positions to step-aligned scale values", () => {
    expect(rangeValueAt(100, 100, 300, 0.25, 3, 0.05)).toBe(0.25);
    expect(rangeValueAt(400, 100, 300, 0.25, 3, 0.05)).toBe(3);
    expect(rangeValueAt(250, 100, 300, 0.25, 3, 0.05)).toBe(1.65);
  });
  it("supports negative depth and rotation ranges without floating point noise", () => {
    expect(rangeValueAt(250, 100, 300, -6, 6, 0.1)).toBe(0);
    expect(rangeValueAt(180, 100, 300, -6, 6, 0.1)).toBe(-2.8);
    expect(rangeValueAt(325, 100, 300, -180, 180, 5)).toBe(90);
  });
  it("clamps when a captured hand moves outside the slider", () => {
    expect(rangeValueAt(-500, 100, 300, 0.25, 3, 0.05)).toBe(0.25);
    expect(rangeValueAt(1500, 100, 300, 0.25, 3, 0.05)).toBe(3);
  });
});
