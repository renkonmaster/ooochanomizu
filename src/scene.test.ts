import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AtelierScene } from "./scene";

// Exercise the real camera and OrbitControls math without creating WebGL.
function navigation() {
  const camera = new PerspectiveCamera(42, 4 / 3, 0.1, 100);
  camera.position.set(7.5, 6.5, 12);
  const controls = new OrbitControls(camera, null);
  const host = { clientWidth: 800, clientHeight: 600 };
  controls.domElement = host as HTMLElement;
  controls.enableDamping = true;
  controls.target.set(0, 1.3, 0);
  controls.minDistance = 5;
  controls.maxDistance = 24;
  controls.maxPolarAngle = Math.PI / 2 - 0.08;
  controls.update();
  const view: AtelierScene = Object.assign(Object.create(AtelierScene.prototype), {
    camera, controls, host, dragging: null,
  });
  return { view, camera, controls };
}

describe("hand viewport navigation", () => {
  it("orbits around the target without changing distance, and stops without drift", () => {
    const { view, camera, controls } = navigation();
    const before = camera.position.clone();
    const target = controls.target.clone();
    const distance = controls.getDistance();
    view.navigate("orbit", 0.1, 0.05);
    expect(camera.position.equals(before)).toBe(false);
    expect(controls.target.equals(target)).toBe(true);
    expect(controls.getDistance()).toBeCloseTo(distance);
    const after = camera.position.clone();
    for (let i = 0; i < 20; i++) controls.update();
    expect(camera.position.distanceTo(after)).toBeLessThan(1e-10);
    expect(controls.enableDamping).toBe(true);
  });

  it("pans the camera and target together", () => {
    const { view, camera, controls } = navigation();
    const cameraBefore = camera.position.clone();
    const targetBefore = controls.target.clone();
    view.navigate("pan", 0.1, 0.05);
    const cameraDelta = camera.position.clone().sub(cameraBefore);
    const targetDelta = controls.target.clone().sub(targetBefore);
    expect(targetDelta.length()).toBeGreaterThan(0);
    expect(cameraDelta.distanceTo(targetDelta)).toBeLessThan(1e-10);
  });

  it("zooms in when moving up and out when moving down, within distance limits", () => {
    const { view, controls } = navigation();
    const before = controls.getDistance();
    view.navigate("zoom", 0, -0.1);
    expect(controls.getDistance()).toBeLessThan(before);
    view.navigate("zoom", 0, 0.2);
    expect(controls.getDistance()).toBeGreaterThan(before);
    view.navigate("zoom", 0, -10);
    expect(controls.getDistance()).toBeCloseTo(5);
    view.navigate("zoom", 0, 10);
    expect(controls.getDistance()).toBeCloseTo(24);
  });

  it("keeps the camera above the floor even with extreme rotation input", () => {
    const { view, camera, controls } = navigation();
    view.navigate("orbit", 0, -10);
    expect(controls.getPolarAngle()).toBeCloseTo(controls.maxPolarAngle);
    expect(camera.position.y).toBeGreaterThan(controls.target.y);
  });

  it("ignores invalid deltas and navigation while an object is being dragged", () => {
    const { view, camera } = navigation();
    const before = camera.position.clone();
    view.navigate("orbit", NaN, 0.1);
    view.navigate("zoom", 0, Infinity);
    Object.assign(view, { dragging: "object" });
    view.navigate("orbit", 0.1, 0.1);
    view.navigate("pan", 0.1, 0.1);
    view.navigate("zoom", 0, 0.1);
    expect(camera.position.equals(before)).toBe(true);
  });

  it("resets the target and camera even while mouse damping is pending", () => {
    const { view, camera, controls } = navigation();
    controls.rotateLeft(0.5);
    view.resetView();
    for (let i = 0; i < 20; i++) controls.update();
    expect(camera.position.distanceTo({ x: 7.5, y: 6.5, z: 12 })).toBeLessThan(1e-10);
    expect(controls.target.toArray()).toEqual([0, 1.3, 0]);
  });
});
