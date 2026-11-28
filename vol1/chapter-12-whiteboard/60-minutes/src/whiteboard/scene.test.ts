/* NOT PART OF THE INTERVIEW. Tests for the shape helpers. */
import { makeRect } from "./scene";

describe("makeRect", () => {
  it("makes the same rectangle whichever corner the drag starts from", () => {
    const expected = { id: "1", kind: "rect", x: 10, y: 20, width: 30, height: 40 };

    expect(makeRect("1", { x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected);
    expect(makeRect("1", { x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(makeRect("1", { x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
  });
});
