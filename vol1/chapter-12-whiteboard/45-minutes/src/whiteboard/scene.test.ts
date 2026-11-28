/* NOT PART OF THE INTERVIEW. Tests for the shape helpers. */
import { hitTest, makeRect } from "./scene";
import type { Scene } from "./scene";

const twoOverlapping: Scene = {
  shapesById: {
    low: { id: "low", kind: "rect", x: 0, y: 0, width: 100, height: 100 },
    high: { id: "high", kind: "rect", x: 50, y: 50, width: 100, height: 100 },
  },
  order: ["low", "high"],
};

describe("makeRect", () => {
  it("makes the same rectangle whichever corner the drag starts from", () => {
    const expected = { id: "1", kind: "rect", x: 10, y: 20, width: 30, height: 40 };

    expect(makeRect("1", { x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected);
    expect(makeRect("1", { x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(makeRect("1", { x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
  });
});

describe("hitTest", () => {
  it("returns the top-most shape where two shapes overlap", () => {
    expect(hitTest(twoOverlapping, { x: 75, y: 75 })).toBe("high");
  });

  it("returns the lower shape where only that one is under the point", () => {
    expect(hitTest(twoOverlapping, { x: 10, y: 10 })).toBe("low");
  });

  it("returns null on empty board", () => {
    expect(hitTest(twoOverlapping, { x: 400, y: 400 })).toBeNull();
    expect(hitTest({ shapesById: {}, order: [] }, { x: 0, y: 0 })).toBeNull();
  });

  it("still hits a shape from 4 pixels outside its box, and not from 5", () => {
    expect(hitTest(twoOverlapping, { x: 154, y: 100 })).toBe("high");
    expect(hitTest(twoOverlapping, { x: 155, y: 100 })).toBeNull();
    expect(hitTest(twoOverlapping, { x: -4, y: 50 })).toBe("low");
    expect(hitTest(twoOverlapping, { x: -5, y: 50 })).toBeNull();
  });

  it("can pick a rectangle that has no width", () => {
    const line: Scene = {
      shapesById: { thin: { id: "thin", kind: "rect", x: 20, y: 20, width: 0, height: 80 } },
      order: ["thin"],
    };

    expect(hitTest(line, { x: 22, y: 50 })).toBe("thin");
  });

  it("does not change the drawing order while it looks from the top", () => {
    hitTest(twoOverlapping, { x: 75, y: 75 });

    expect(twoOverlapping.order).toEqual(["low", "high"]);
  });
});
