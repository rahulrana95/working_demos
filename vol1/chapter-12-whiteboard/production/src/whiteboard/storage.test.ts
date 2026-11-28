/* NOT PART OF THE INTERVIEW. Tests for saving and loading. Neither may ever throw. */
import type { Scene } from "./scene";
import { loadScene, saveScene } from "./storage";

const scene: Scene = {
  shapesById: {
    r: { id: "r", kind: "rect", x: 1, y: 2, width: 3, height: 4, stroke: "#000" },
    p: {
      id: "p",
      kind: "path",
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      stroke: "#000",
      points: [{ x: 0, y: 0 }],
    },
  },
  order: ["r", "p"],
};

describe("saveScene and loadScene", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads what was saved", () => {
    const result = saveScene("board", scene);

    expect(result).toEqual({ ok: true, size: JSON.stringify(scene).length });
    expect(loadScene("board")).toEqual(scene);
  });

  it("returns null when nothing was saved", () => {
    expect(loadScene("nothing-here")).toBeNull();
  });

  it("reports a failed save and does not throw when the storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(saveScene("board", scene)).toEqual({ ok: false, size: 0 });
  });

  it("returns null and does not throw when reading the storage fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access is denied.", "SecurityError");
    });

    expect(loadScene("board")).toBeNull();
  });

  it("returns null for text that is not JSON", () => {
    window.localStorage.setItem("board", "{not json");

    expect(loadScene("board")).toBeNull();
  });

  it.each([
    ["a number", "42"],
    ["null", "null"],
    ["no order", '{"shapesById":{}}'],
    ["an id in the order without a shape", '{"shapesById":{},"order":["a"]}'],
    [
      "a shape of an unknown kind",
      '{"shapesById":{"a":{"id":"a","kind":"star","x":0,"y":0,"width":1,"height":1,"stroke":"#000"}},"order":["a"]}',
    ],
    [
      "a shape without a number for x",
      '{"shapesById":{"a":{"id":"a","kind":"rect","x":"0","y":0,"width":1,"height":1,"stroke":"#000"}},"order":["a"]}',
    ],
    [
      "a freehand line without points",
      '{"shapesById":{"a":{"id":"a","kind":"path","x":0,"y":0,"width":1,"height":1,"stroke":"#000"}},"order":["a"]}',
    ],
    [
      "a shape under the wrong id",
      '{"shapesById":{"a":{"id":"b","kind":"rect","x":0,"y":0,"width":1,"height":1,"stroke":"#000"}},"order":["a"]}',
    ],
  ])("returns null for saved text that is not a scene: %s", (_name, text) => {
    window.localStorage.setItem("board", text);

    expect(loadScene("board")).toBeNull();
  });
});
