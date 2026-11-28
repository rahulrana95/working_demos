/* NOT PART OF THE INTERVIEW. Tests for the shape helpers. */
import { distanceToSegment, isShapeHit, makePath, makeRect } from "./scene";

describe("makeRect", () => {
  it("makes the same rectangle whichever corner the drag starts from", () => {
    const expected = { id: "1", kind: "rect", x: 10, y: 20, width: 30, height: 40, stroke: "red" };

    expect(makeRect("1", { x: 10, y: 20 }, { x: 40, y: 60 }, "red")).toEqual(expected);
    expect(makeRect("1", { x: 40, y: 60 }, { x: 10, y: 20 }, "red")).toEqual(expected);
  });
});

describe("makePath", () => {
  it("stores the box of the line, and the points counted from the corner of the box", () => {
    const path = makePath(
      "p",
      [
        { x: 50, y: 80 },
        { x: 30, y: 100 },
        { x: 70, y: 60 },
      ],
      "blue",
    );

    expect(path).toEqual({
      id: "p",
      kind: "path",
      x: 30,
      y: 60,
      width: 40,
      height: 40,
      stroke: "blue",
      points: [
        { x: 20, y: 20 },
        { x: 0, y: 40 },
        { x: 40, y: 0 },
      ],
    });
  });

  it("makes a box of no size for a line of one point", () => {
    expect(makePath("p", [{ x: 5, y: 7 }], "blue")).toMatchObject({
      x: 5,
      y: 7,
      width: 0,
      height: 0,
      points: [{ x: 0, y: 0 }],
    });
  });

  it("takes a line of 200,000 points without an error", () => {
    const points = Array.from({ length: 200_000 }, (_unused, index) => ({ x: index, y: -index }));

    const path = makePath("long", points, "blue");

    expect(path.width).toBe(199_999);
    expect(path.y).toBe(-199_999);
  });
});

describe("distanceToSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it("measures straight down to the piece when the point is beside it", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
  });

  it("measures to the nearest end when the point is beyond the piece", () => {
    expect(distanceToSegment({ x: 14, y: 3 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: -3, y: 4 }, a, b)).toBe(5);
  });

  it("measures to the point itself when both ends are the same", () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });
});

describe("isShapeHit", () => {
  it("hits a rectangle anywhere in its box, and within the slop around it", () => {
    const rect = makeRect("r", { x: 0, y: 0 }, { x: 10, y: 10 }, "red");

    expect(isShapeHit(rect, { x: 5, y: 5 }, 0)).toBe(true);
    expect(isShapeHit(rect, { x: 12, y: 5 }, 2)).toBe(true);
    expect(isShapeHit(rect, { x: 13, y: 5 }, 2)).toBe(false);
  });

  it("hits a line of one point near that point", () => {
    const dot = makePath("d", [{ x: 5, y: 5 }], "red");

    expect(isShapeHit(dot, { x: 7, y: 5 }, 4)).toBe(true);
    expect(isShapeHit(dot, { x: 15, y: 5 }, 4)).toBe(false);
  });
});
