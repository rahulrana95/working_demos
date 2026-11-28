/* NOT PART OF THE INTERVIEW. Tests for the view: pan and zoom maths. */
import { toBoard, zoomAt } from "./view";
import type { View } from "./view";

describe("toBoard", () => {
  it("returns the same position when the view is at the start and not zoomed", () => {
    expect(toBoard({ x: 0, y: 0, scale: 1 }, { x: 30, y: 40 })).toEqual({ x: 30, y: 40 });
  });

  it("adds the position of the view", () => {
    expect(toBoard({ x: 500, y: -200, scale: 1 }, { x: 30, y: 40 })).toEqual({ x: 530, y: -160 });
  });

  it("divides by the scale: at 200 percent, 100 canvas pixels are 50 on the board", () => {
    expect(toBoard({ x: 500, y: 0, scale: 2 }, { x: 100, y: 100 })).toEqual({ x: 550, y: 50 });
  });
});

describe("zoomAt", () => {
  const view: View = { x: 100, y: 200, scale: 1 };

  it("keeps the board position under the pointer where it is", () => {
    const pointer = { x: 300, y: 150 };
    const before = toBoard(view, pointer);

    for (const factor of [0.25, 0.5, 1.1, 2, 4]) {
      const after = toBoard(zoomAt(view, pointer, factor), pointer);

      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    }
  });

  it("multiplies the scale by the factor", () => {
    expect(zoomAt(view, { x: 0, y: 0 }, 2).scale).toBe(2);
    expect(zoomAt(view, { x: 0, y: 0 }, 0.5).scale).toBe(0.5);
  });

  it("zooming in and then out by the same factor gives the first view", () => {
    const pointer = { x: 123, y: 45 };

    const back = zoomAt(zoomAt(view, pointer, 3), pointer, 1 / 3);

    expect(back.x).toBeCloseTo(view.x);
    expect(back.y).toBeCloseTo(view.y);
    expect(back.scale).toBeCloseTo(1);
  });

  it("does not zoom in further than 800 percent or out further than 10 percent", () => {
    expect(zoomAt(view, { x: 0, y: 0 }, 1000).scale).toBe(8);
    expect(zoomAt(view, { x: 0, y: 0 }, 0.0001).scale).toBe(0.1);
  });

  it("does not move the view when the scale is already at its limit", () => {
    const atLimit = zoomAt(view, { x: 300, y: 150 }, 1000);

    expect(zoomAt(atLimit, { x: 10, y: 10 }, 2)).toEqual(atLimit);
  });
});
