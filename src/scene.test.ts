import { describe, expect, it } from "vitest";
import { Fog, PerspectiveCamera, Scene } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AtelierScene } from "./scene";
import type { SceneObject } from "./model";

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
  it("keeps the Viewer camera fixed when objects change or the viewport resizes", () => {
    const { view, camera, controls } = navigation();
    Object.assign(view, {
      scene: new Scene(), meshes: new Map(), selectionBox: { visible: false },
      host: { getBoundingClientRect: () => ({ width: 390, height: 844 }) },
      renderer: { setSize() {} },
    });
    view.setViewer(true);
    const position = camera.position.clone();
    const rotation = camera.quaternion.clone();
    const target = controls.target.clone();
    const object: SceneObject = {
      id: "object", kind: "cube", color: "#83cbb2",
      position: [0, 1, 0], rotation: [0, 0, 0], scale: 1,
    };
    for (const objects of [
      [object],
      [{ ...object, position: [10, 10, -10] as [number, number, number], scale: 3 }],
      [object, { ...object, id: "added" }],
      [],
    ]) {
      view.sync(objects);
      expect(camera.position.equals(position)).toBe(true);
      expect(camera.quaternion.equals(rotation)).toBe(true);
      expect(controls.target.equals(target)).toBe(true);
    }
    Reflect.get(view, "resize").call(view);
    expect(camera.aspect).toBeCloseTo(390 / 844);
    expect(camera.position.equals(position)).toBe(true);
    expect(controls.target.toArray()).toEqual([0, 1.3, 0]);
    expect(controls.getDistance()).toBeCloseTo(24);
  });

  it("continues orbiting at a constant distance and height around the fixed center", () => {
    const { view, camera, controls } = navigation();
    Object.assign(view, { scene: new Scene(), meshes: new Map(), selectionBox: { visible: false } });
    view.setViewer(true);
    const before = camera.position.clone();
    const height = camera.position.y;
    for (let step = 0; step < 24; step++) {
      Reflect.get(view, "updateViewer").call(view, 5);
      expect(controls.target.toArray()).toEqual([0, 1.3, 0]);
      expect(controls.getDistance()).toBeCloseTo(24);
      expect(camera.position.y).toBeCloseTo(height);
      if (step === 0) expect(camera.position.equals(before)).toBe(false);
    }
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-10);
  });

  it("disables editing in Viewer and restores the Editor camera on return", () => {
    const { view, camera, controls } = navigation();
    const scene = new Scene();
    const fog = new Fog("#ffffff", 22, 50);
    scene.fog = fog;
    Object.assign(view, { scene, meshes: new Map(), selectionBox: { visible: false } });
    const position = camera.position.clone();
    const target = controls.target.clone();
    const far = camera.far;
    view.setViewer(true);
    expect(controls.enabled).toBe(false);
    expect(scene.fog).toBeNull();
    expect(view.pick(0.5, 0.5)).toBeNull();
    expect(view.beginDrag("object", 0.5, 0.5)).toBe(false);
    const viewerPosition = camera.position.clone();
    view.navigate("orbit", 0.1, 0.1);
    view.endDrag();
    expect(camera.position.equals(viewerPosition)).toBe(true);
    expect(controls.enabled).toBe(false);
    view.setViewer(false);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-10);
    expect(controls.target.equals(target)).toBe(true);
    expect(camera.far).toBe(far);
    expect(scene.fog).toBe(fog);
    expect(controls.enabled).toBe(true);
  });
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
