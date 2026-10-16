import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clamp, type SceneObject } from "./model";

type Solid = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export type ViewMode = "orbit" | "pan" | "zoom";

export class AtelierScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private controls: OrbitControls;
  private meshes = new Map<string, Solid>();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane();
  private offset = new THREE.Vector3();
  private selected: string | null = null;
  private hovered: string | null = null;
  private dragging: string | null = null;
  private frame = 0;
  private observer: ResizeObserver;
  private selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x245fae);

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor("#e7e9ed");
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute(
      "aria-label",
      "立体キャンバス。立体をドラッグで移動。右ドラッグで視点を回転。",
    );
    this.canvas.tabIndex = 0;
    host.prepend(this.canvas);
    this.scene.fog = new THREE.Fog("#e7e9ed", 22, 50);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#bec3cb", 3));
    const light = new THREE.DirectionalLight("#fff9ed", 4);
    light.position.set(-4, 9, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -12;
    light.shadow.camera.right = 12;
    light.shadow.camera.top = 12;
    light.shadow.camera.bottom = -12;
    light.shadow.normalBias = 0.04;
    this.scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: "#e9ebee", roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(30, 30, "#bec4cd", "#cdd2d9");
    this.scene.add(grid);
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.mouseButtons = {
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = { TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.minDistance = 5;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.resetView();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.render();
  }

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Keep the canvas intrinsic size from changing its host's layout.
    this.renderer.setSize(width, height, false);
  }

  resetView(): void {
    // Flush damping so a previous mouse/hand movement cannot move the reset view.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.set(7.5, 6.5, 12);
    this.controls.target.set(0, 1.3, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  navigate(mode: ViewMode, dx: number, dy: number): void {
    if (this.dragging || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // Apply each inference delta exactly once; mouse navigation retains damping.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    if (mode === "orbit") {
      this.controls.rotateLeft(dx * Math.PI * 2);
      this.controls.rotateUp(dy * Math.PI);
    } else if (mode === "pan") {
      this.controls.pan(dx * this.host.clientWidth, dy * this.host.clientHeight);
    } else {
      this.controls.dollyIn(Math.exp(dy * 3));
    }
    this.controls.enableDamping = damping;
  }

  private render = (): void => {
    this.frame = requestAnimationFrame(this.render);
    this.controls.update();
    if (this.selected && this.meshes.has(this.selected))
      this.selectionBox.setFromObject(this.meshes.get(this.selected)!);
    this.renderer.render(this.scene, this.camera);
  };

  sync(objects: SceneObject[]): void {
    const ids = new Set(objects.map((o) => o.id));
    for (const [id, mesh] of this.meshes) {
      if (ids.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.meshes.delete(id);
    }
    for (const o of objects) {
      let mesh = this.meshes.get(o.id);
      if (mesh && mesh.userData.kind !== o.kind) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.meshes.delete(o.id);
        mesh = undefined;
      }
      if (!mesh) {
        const geometry =
          o.kind === "cube"
            ? new THREE.BoxGeometry(1, 1, 1)
            : o.kind === "sphere"
              ? new THREE.SphereGeometry(0.6, 32, 24)
              : o.kind === "cylinder"
                ? new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32)
                : o.kind === "cone"
                  ? new THREE.ConeGeometry(0.6, 1.3, 32)
                  : new THREE.TorusGeometry(0.48, 0.18, 16, 48);
        mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: o.color,
            roughness: 0.42,
            metalness: 0.03,
          }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = o.id;
        mesh.userData.kind = o.kind;
        this.scene.add(mesh);
        this.meshes.set(o.id, mesh);
      }
      mesh.position.fromArray(o.position);
      mesh.rotation.set(...o.rotation);
      mesh.scale.setScalar(o.scale);
      mesh.material.color.set(o.color);
    }
    this.highlight();
    this.scene.updateMatrixWorld(true);
  }

  select(id: string | null): void {
    this.selected = id;
    this.highlight();
  }
  hover(id: string | null): void {
    this.hovered = id;
    this.highlight();
  }

  private highlight(): void {
    for (const [id, mesh] of this.meshes) {
      mesh.material.emissive.set(
        id === this.hovered || id === this.selected ? "#254d7c" : "#000000",
      );
      mesh.material.emissiveIntensity = id === this.selected ? 0.12 : 0.07;
    }
    this.selectionBox.visible =
      !!this.selected && this.meshes.has(this.selected);
  }

  private aim(x: number, y: number): void {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(
      new THREE.Vector2(x * 2 - 1, 1 - y * 2),
      this.camera,
    );
  }

  pick(x: number, y: number): string | null {
    this.aim(x, y);
    const hit = this.raycaster.intersectObjects(
      [...this.meshes.values()],
      false,
    )[0];
    return hit ? (hit.object.userData.id as string) : null;
  }

  beginDrag(id: string, x: number, y: number): boolean {
    const mesh = this.meshes.get(id);
    if (!mesh) return false;
    this.aim(x, y);
    this.plane.setFromNormalAndCoplanarPoint(
      this.camera.getWorldDirection(new THREE.Vector3()),
      mesh.position,
    );
    const point = this.raycaster.ray.intersectPlane(
      this.plane,
      new THREE.Vector3(),
    );
    if (!point) return false;
    this.offset.copy(mesh.position).sub(point);
    this.dragging = id;
    this.controls.enabled = false;
    return true;
  }

  drag(x: number, y: number): [number, number, number] | null {
    if (!this.dragging) return null;
    this.aim(x, y);
    const point = this.raycaster.ray.intersectPlane(
      this.plane,
      new THREE.Vector3(),
    );
    if (!point) return null;
    point.add(this.offset);
    return [
      clamp(point.x, -10, 10),
      clamp(point.y, 0.3, 10),
      clamp(point.z, -10, 10),
    ];
  }

  endDrag(): void {
    this.dragging = null;
    this.controls.enabled = true;
  }
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
  }
}
