import { describe, expect, it } from "vitest";
import { makeObject, parseScene, serializeScene } from "./model";

describe("safe scene persistence", () => {
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
