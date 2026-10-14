import { describe, expect, it } from "vitest";
import { History, makeObject, parseScene, serializeScene } from "./model";

describe("scene history and safe persistence", () => {
  it("undoes a whole drag as one edit and redoes it", () => {
    const history = new History();
    const before = [makeObject("cube", "#83cbb2", 0)];
    const after = structuredClone(before);
    after[0].position = [2, 3, 4];
    expect(history.commit(before, after)).toBe(true);
    expect(history.undo(after)).toEqual(before);
    expect(history.canUndo).toBe(false);
    expect(history.redo(before)).toEqual(after);
  });
  it("discards redo after editing an undone scene and ignores no-op edits", () => {
    const history = new History();
    const first = [makeObject("sphere", "#f0a58b", 1)];
    expect(history.commit(first, first)).toBe(false);
    history.commit([], first);
    history.undo(first);
    history.commit([], [makeObject("cube", "#83cbb2", 2)]);
    expect(history.canRedo).toBe(false);
  });
  it("isolates saved history from later object mutation", () => {
    const history = new History();
    const before = [makeObject("cube", "#83cbb2", 0)];
    history.commit(before, []);
    before[0].position[0] = 999;
    expect(history.undo([])![0].position[0]).toBe(-3);
  });
  it("round-trips an empty scene and every primitive", () => {
    expect(parseScene(serializeScene([]))).toEqual([]);
    for (const kind of [
      "cube",
      "sphere",
      "cylinder",
      "cone",
      "torus",
    ] as const) {
      const objects = [makeObject(kind, "#b8a1d6", 0)];
      expect(parseScene(serializeScene(objects))).toEqual(objects);
    }
  });
  it.each([
    { version: 2, objects: [] },
    { version: 1, objects: Array(101).fill({}) },
    { version: 1, objects: [{ kind: "script" }] },
    {
      version: 1,
      objects: [
        { ...makeObject("cube", "#83cbb2", 0), position: [1e100, 0, 0] },
      ],
    },
    {
      version: 1,
      objects: [{ ...makeObject("cube", "#83cbb2", 0), scale: -1 }],
    },
    {
      version: 1,
      objects: [{ ...makeObject("cube", "#83cbb2", 0), color: "<script>" }],
    },
  ])("rejects unsupported or unsafe imported scenes: %j", (data) => {
    expect(() => parseScene(JSON.stringify(data))).toThrow();
  });
  it("rejects duplicate ids rather than merging two objects", () => {
    const object = makeObject("cube", "#83cbb2", 0);
    expect(() => parseScene(serializeScene([object, object]))).toThrow();
  });
  it("keeps a full 100-object canvas within the persisted scene bounds", () => {
    const objects = Array.from({ length: 100 }, (_, i) =>
      makeObject("cube", "#83cbb2", i),
    );
    expect(parseScene(serializeScene(objects))).toEqual(objects);
  });
});
