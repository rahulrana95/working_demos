/*
 * NOT PART OF THE INTERVIEW.
 * jsdom has no real canvas. drawScene only needs the calls in `Surface`, so
 * these tests pass an object that writes every call down.
 */
import { boardReducer, createBoard } from "./board";
import type { BoardState } from "./board";
import type { Presence } from "./presence";
import { drawScene, paint } from "./render";
import type { Surface } from "./render";
import { makePath } from "./scene";
import type { Scene } from "./scene";

const scene: Scene = {
  shapesById: {
    a: { id: "a", kind: "rect", x: 10, y: 20, width: 30, height: 40, stroke: "black" },
    b: { id: "b", kind: "rect", x: 50, y: 60, width: 70, height: 80, stroke: "red" },
    line: makePath(
      "line",
      [
        { x: 100, y: 100 },
        { x: 110, y: 120 },
      ],
      "blue",
    ),
  },
  order: ["b", "a", "line"],
};

function createRecorder() {
  const calls: string[] = [];
  let dash: number[] = [];
  const surface: Surface = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineJoin: "miter",
    lineCap: "butt",
    font: "",
    setLineDash(segments) {
      dash = [...segments];
    },
    strokeRect(x, y, width, height) {
      const style = dash.length === 0 ? "solid" : "dashed";
      calls.push(`rect ${x},${y} ${width}x${height} ${this.strokeStyle} ${style}`);
    },
    beginPath: () => calls.push("begin"),
    lineTo: (x, y) => calls.push(`line ${x},${y}`),
    arc: (x, y, radius) => calls.push(`dot ${x},${y} r${radius}`),
    stroke() {
      calls.push(`stroke ${this.strokeStyle}`);
    },
    fill() {
      calls.push(`fill ${this.fillStyle}`);
    },
    fillText(text, x, y) {
      calls.push(`text ${text} ${x},${y} ${this.font}`);
    },
  };
  return { calls, surface };
}

const bela: Presence = {
  userId: "b",
  name: "Bela",
  colour: "purple",
  cursor: { x: 200, y: 150 },
  selectedId: "a",
};

describe("drawScene", () => {
  it("draws the shapes whose ids it is given, in that order, each in its colour", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["b", "a"], null, [], 1);

    expect(calls).toEqual(["rect 50,60 70x80 red solid", "rect 10,20 30x40 black solid"]);
  });

  it("draws a freehand line through its points, at the place of its box", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["line"], null, [], 1);

    expect(calls).toEqual(["begin", "line 100,100", "line 110,120", "line 100,100", "stroke blue"]);
  });

  it("draws our selection as a solid box, last of the boxes, 4 pixels around the shape", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["a"], "a", [], 1);

    expect(calls[calls.length - 1]).toBe("rect 6,16 38x48 #1a56db solid");
  });

  it("draws the selection of another user as a dashed box in their colour", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["a"], null, [bela], 1);

    expect(calls).toContain("rect 6,16 38x48 purple dashed");
  });

  it("draws the pointer of another user as a dot with their name next to it", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, [], null, [bela], 1);

    expect(calls).toContain("dot 200,150 r5");
    expect(calls).toContain("fill purple");
    expect(calls).toContain("text Bela 208,154 12px system-ui, sans-serif");
  });

  it("draws no dot for a user whose pointer is not over the board", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, [], null, [{ ...bela, cursor: null, selectedId: null }], 1);

    expect(calls).toEqual([]);
  });

  it("keeps lines, gaps, dots and names the same size on the screen when zoomed", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["a"], "a", [bela], 2);

    expect(surface.lineWidth).toBe(1);
    expect(calls).toContain("rect 8,18 34x44 #1a56db solid");
    expect(calls).toContain("dot 200,150 r2.5");
    expect(calls).toContain("text Bela 204,152 6px system-ui, sans-serif");
  });

  it("draws no selection box for a selected shape that is gone", () => {
    const { calls, surface } = createRecorder();

    drawScene(
      surface,
      scene,
      ["a"],
      "gone",
      [{ ...bela, selectedId: "also-gone", cursor: null }],
      1,
    );

    expect(calls).toEqual(["rect 10,20 30x40 black solid"]);
  });
});

describe("paint", () => {
  function createCanvas() {
    const canvas = document.createElement("canvas");
    const context = {
      ...createRecorder().surface,
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
    };
    Object.defineProperty(canvas, "getContext", { value: () => context });
    return { canvas, context };
  }

  function board(view = { x: 0, y: 0, scale: 1 }): BoardState {
    const sized = boardReducer(createBoard({ userId: "a", scene }), {
      type: "resize",
      width: 600,
      height: 300,
    });
    return { ...sized, view };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sizes the canvas from the reported size and the device pixel ratio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas, context } = createCanvas();

    paint(canvas, board());

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(600);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, -0, -0);
  });

  it("puts the view and the ratio into one transform, and clears the part in view", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas, context } = createCanvas();

    paint(canvas, board({ x: 100, y: 50, scale: 0.5 }));

    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, -100, -50);
    expect(context.clearRect).toHaveBeenCalledWith(100, 50, 1200, 600);
  });

  it("returns how many shapes it drew", () => {
    const { canvas } = createCanvas();

    expect(paint(canvas, board())).toBe(3);
    expect(paint(canvas, board({ x: 90_000, y: 90_000, scale: 1 }))).toBe(0);
  });

  it("returns 0 and does not throw when the browser gives no 2D context", () => {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "getContext", { value: () => null });

    expect(paint(canvas, board())).toBe(0);
  });
});
