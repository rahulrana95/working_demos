/*
 * NOT PART OF THE INTERVIEW.
 * Tests for the grid. The strongest one compares the grid with the slow and
 * simple way, a look at every shape, on thousands of random points.
 */
import { hitTest, shapesNear } from "./grid";
import { makePath } from "./scene";
import type { Scene, Shape } from "./scene";

function rect(id: string, x: number, y: number, width = 10, height = 10): Shape {
  return { id, kind: "rect", x, y, width, height, stroke: "#000" };
}

function sceneOf(...shapes: Shape[]): Scene {
  const shapesById: Record<string, Shape> = {};
  for (const shape of shapes) {
    shapesById[shape.id] = shape;
  }
  return { shapesById, order: shapes.map((shape) => shape.id) };
}

/** A small random number generator with a seed, so every run tests the same points. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomScene(count: number, random: () => number): Scene {
  const shapes = Array.from({ length: count }, (_unused, index) =>
    rect(
      String(index),
      random() * 4000 - 2000,
      random() * 4000 - 2000,
      random() * 300,
      random() * 300,
    ),
  );
  return sceneOf(...shapes);
}

function touches(shape: Shape, box: { x: number; y: number; width: number; height: number }) {
  return (
    shape.x <= box.x + box.width &&
    shape.x + shape.width >= box.x &&
    shape.y <= box.y + box.height &&
    shape.y + shape.height >= box.y
  );
}

const twoOverlapping: Scene = {
  shapesById: {
    low: rect("low", 0, 0, 100, 100),
    high: rect("high", 50, 50, 100, 100),
  },
  order: ["low", "high"],
};

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
      shapesById: { thin: rect("thin", 20, 20, 0, 80) },
      order: ["thin"],
    };

    expect(hitTest(line, { x: 22, y: 50 })).toBe("thin");
  });

  it("does not change the drawing order while it looks from the top", () => {
    hitTest(twoOverlapping, { x: 75, y: 75 });

    expect(twoOverlapping.order).toEqual(["low", "high"]);
  });
});

describe("shapesNear", () => {
  it("returns the shapes in the cells that the box touches", () => {
    const scene = sceneOf(rect("near", 10, 10), rect("far", 5000, 5000));

    expect(shapesNear(scene, { x: 0, y: 0, width: 100, height: 100 })).toEqual(["near"]);
    expect(shapesNear(scene, { x: 4990, y: 4990, width: 100, height: 100 })).toEqual(["far"]);
  });

  it("returns nothing for an empty part of the board, and for an empty scene", () => {
    const scene = sceneOf(rect("a", 10, 10));

    expect(shapesNear(scene, { x: 9000, y: 9000, width: 100, height: 100 })).toEqual([]);
    expect(shapesNear(sceneOf(), { x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
  });

  it("returns the ids in drawing order, whatever the order of the cells", () => {
    const scene = sceneOf(rect("first", 600, 600), rect("second", 10, 10), rect("third", 300, 10));

    expect(shapesNear(scene, { x: 0, y: 0, width: 700, height: 700 })).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("returns a shape that lies in several cells only once", () => {
    const scene = sceneOf(rect("wide", 100, 100, 1000, 1000));

    expect(shapesNear(scene, { x: 0, y: 0, width: 2000, height: 2000 })).toEqual(["wide"]);
  });

  it("finds a large shape from a cell that only its middle touches", () => {
    const scene = sceneOf(rect("wide", 0, 0, 3000, 3000));

    expect(shapesNear(scene, { x: 1400, y: 1400, width: 10, height: 10 })).toEqual(["wide"]);
  });

  it("works on the left of and above the start of the board, where positions are negative", () => {
    const scene = sceneOf(rect("a", -300, -300), rect("b", -10, -10), rect("c", 10, 10));

    expect(shapesNear(scene, { x: -310, y: -310, width: 30, height: 30 })).toEqual(["a"]);
    expect(shapesNear(scene, { x: -20, y: -20, width: 5, height: 5 })).toEqual(["b"]);
  });

  it("never misses a shape that touches the box: 500 random boxes over 2,000 shapes", () => {
    const random = createRandom(7);
    const scene = randomScene(2000, random);

    for (let round = 0; round < 500; round++) {
      const box = {
        x: random() * 4000 - 2000,
        y: random() * 4000 - 2000,
        width: random() * 800,
        height: random() * 800,
      };
      const near = new Set(shapesNear(scene, box));
      const touching = scene.order.filter((id) => touches(scene.shapesById[id], box));

      expect(touching.filter((id) => !near.has(id))).toEqual([]);
    }
  });

  it("reads a small part of a board of 10,000 shapes for one screen", () => {
    const shapes = Array.from({ length: 10_000 }, (_unused, index) =>
      rect(String(index), (index % 100) * 60, Math.floor(index / 100) * 60, 20, 20),
    );
    const scene = sceneOf(...shapes);

    const near = shapesNear(scene, { x: 3000, y: 3000, width: 720, height: 420 });

    expect(near.length).toBeGreaterThan(80);
    expect(near.length).toBeLessThan(400);
  });

  it("gives the same answer when asked twice, and a fresh one for a new scene", () => {
    const scene = sceneOf(rect("a", 10, 10));
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(shapesNear(scene, box)).toEqual(["a"]);
    expect(shapesNear(scene, box)).toEqual(["a"]);

    const changed = sceneOf(rect("a", 10, 10), rect("b", 20, 20));

    expect(shapesNear(changed, box)).toEqual(["a", "b"]);
    expect(shapesNear(scene, box)).toEqual(["a"]);
  });
});

describe("hitTest on freehand lines and at other zoom levels", () => {
  // A diagonal line from 0, 0 to 100, 100. Its box covers the whole square.
  const diagonal = makePath(
    "line",
    [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    "#000",
  );

  it("hits a freehand line on the line, and not in the empty part of its box", () => {
    const scene = sceneOf(diagonal);

    expect(hitTest(scene, { x: 50, y: 52 })).toBe("line");
    expect(hitTest(scene, { x: 90, y: 10 })).toBeNull();
  });

  it("picks the rectangle under the empty part of a freehand line that lies on top", () => {
    const scene = sceneOf(rect("under", 60, 0, 40, 40), diagonal);

    expect(hitTest(scene, { x: 90, y: 10 })).toBe("under");
    expect(hitTest(scene, { x: 70, y: 70 })).toBe("line");
  });

  it("reaches 4 pixels on the screen: 2 on the board at 200 percent, 8 at 50 percent", () => {
    const scene = sceneOf(rect("a", 100, 100, 50, 50));

    expect(hitTest(scene, { x: 97, y: 120 }, 1)).toBe("a");
    expect(hitTest(scene, { x: 97, y: 120 }, 2)).toBeNull();
    expect(hitTest(scene, { x: 93, y: 120 }, 1)).toBeNull();
    expect(hitTest(scene, { x: 93, y: 120 }, 0.5)).toBe("a");
  });
});

describe("hitTest with the grid", () => {
  it("gives the same shape as a look at every shape: 3,000 random points", () => {
    const random = createRandom(11);
    const scene = randomScene(1500, random);
    const slowHitTest = (x: number, y: number) => {
      const reach = { x: x - 4, y: y - 4, width: 8, height: 8 };
      const hits = scene.order.filter((id) => touches(scene.shapesById[id], reach));
      return hits.length === 0 ? null : hits[hits.length - 1];
    };

    for (let round = 0; round < 3000; round++) {
      const x = random() * 4400 - 2200;
      const y = random() * 4400 - 2200;

      expect(hitTest(scene, { x, y })).toBe(slowHitTest(x, y));
    }
  });

  it("hits a shape in the next cell that is within reach of the click", () => {
    // The cells are 256 wide. The shape starts 2 pixels inside the second cell.
    const scene = sceneOf(rect("edge", 258, 10, 50, 50));

    expect(hitTest(scene, { x: 255, y: 20 })).toBe("edge");
  });
});
