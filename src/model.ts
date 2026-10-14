export const PRIMITIVES = [
  "cube",
  "sphere",
  "cylinder",
  "cone",
  "torus",
] as const;
export type Primitive = (typeof PRIMITIVES)[number];
export type Triple = [number, number, number];
export interface SceneObject {
  id: string;
  kind: Primitive;
  color: string;
  position: Triple;
  rotation: Triple;
  scale: number;
}
export const LABELS: Record<Primitive, string> = {
  cube: "キューブ",
  sphere: "ボール",
  cylinder: "えんちゅう",
  cone: "コーン",
  torus: "リング",
};
export const COLORS = [
  "#83cbb2",
  "#f0a58b",
  "#f0cf77",
  "#a5bcec",
  "#b8a1d6",
  "#f5f2e8",
];
export const MAX_OBJECTS = 100;
export const cloneScene = (objects: SceneObject[]): SceneObject[] =>
  structuredClone(objects);
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function makeObject(
  kind: Primitive,
  color: string,
  count: number,
): SceneObject {
  return {
    id: crypto.randomUUID(),
    kind,
    color,
    position: [
      ((count % 5) - 2) * 1.5,
      1.3,
      -Math.floor((count % 25) / 5) * 1.5 || 0,
    ],
    rotation: [0, 0, 0],
    scale: 1,
  };
}

export class History {
  private past: SceneObject[][] = [];
  private future: SceneObject[][] = [];
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  commit(before: SceneObject[], after: SceneObject[]): boolean {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.past.push(cloneScene(before));
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    return true;
  }
  undo(current: SceneObject[]): SceneObject[] | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(cloneScene(current));
    return cloneScene(previous);
  }
  redo(current: SceneObject[]): SceneObject[] | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneScene(current));
    return cloneScene(next);
  }
}

export function serializeScene(objects: SceneObject[]): string {
  return JSON.stringify({ version: 1, objects }, null, 2);
}

export function parseScene(raw: string): SceneObject[] {
  const data: unknown = JSON.parse(raw);
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== 1 ||
    !("objects" in data) ||
    !Array.isArray(data.objects) ||
    data.objects.length > MAX_OBJECTS
  )
    throw new Error("作品ファイルの形式が正しくありません。");
  const ids = new Set<string>();
  return data.objects.map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw new Error("立体データが正しくありません。");
    const o = item as SceneObject;
    const triple = (v: unknown, limit: number): v is Triple =>
      Array.isArray(v) &&
      v.length === 3 &&
      v.every(
        (n) =>
          typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= limit,
      );
    if (
      typeof o.id !== "string" ||
      o.id.length > 100 ||
      ids.has(o.id) ||
      !PRIMITIVES.includes(o.kind) ||
      typeof o.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(o.color) ||
      !triple(o.position, 20) ||
      !triple(o.rotation, 100) ||
      typeof o.scale !== "number" ||
      !Number.isFinite(o.scale) ||
      o.scale < 0.25 ||
      o.scale > 3
    )
      throw new Error("立体データが正しくありません。");
    ids.add(o.id);
    return {
      id: o.id,
      kind: o.kind,
      color: o.color,
      position: [...o.position],
      rotation: [...o.rotation],
      scale: o.scale,
    };
  });
}
