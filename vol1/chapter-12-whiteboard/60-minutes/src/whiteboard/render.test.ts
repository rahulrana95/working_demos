/*
 * NOT PART OF THE INTERVIEW.
 * jsdom has no real canvas. drawScene only needs the few calls in `Surface`,
 * so these tests pass an object that writes every call down.
 */
import { boardReducer, createBoard } from "./board";
import type { BoardState } from "./board";
import { drawScene, paint } from "./render";
import type { Surface } from "./render";
import type { Scene } from "./scene";

const scene: Scene = {
  shapesById: {
    a: { id: "a", kind: "rect", x: 10, y: 20, width: 30, height: 40 },
    b: { id: "b", kind: "rect", x: 50, y: 60, width: 70, height: 80 },
  },
  order: ["b", "a"],
};

function createRecorder() {
  const calls: string[] = [];
  const surface: Surface = {
    strokeStyle: "",
    lineWidth: 2,
    strokeRect(x, y, width, height) {
      calls.push(`rect ${x},${y} ${width}x${height} ${this.strokeStyle}`);
    },
  };
  return { calls, surface };
}

describe("drawScene", () => {
  it("draws the shapes whose ids it is given, in that order", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["b", "a"], null);

    expect(calls).toEqual(["rect 50,60 70x80 #1c1f23", "rect 10,20 30x40 #1c1f23"]);
  });

  it("does not draw a shape whose id it is not given", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["a"], null);

    expect(calls).toEqual(["rect 10,20 30x40 #1c1f23"]);
  });

  it("draws a box 4 pixels around the selected shape, last, in another colour", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["b", "a"], "b");

    expect(calls).toHaveLength(3);
    expect(calls[2]).toBe("rect 46,56 78x88 #1a56db");
  });

  it("draws no selection box when the selected shape is not in the scene", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, ["b", "a"], "gone");

    expect(calls).toHaveLength(2);
  });

  it("draws nothing for an empty list", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, [], null);

    expect(calls).toEqual([]);
  });
});

describe("paint", () => {
  function createCanvas() {
    const canvas = document.createElement("canvas");
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
    };
    const getContext = vi.fn(() => context);
    Object.defineProperty(canvas, "getContext", { value: getContext });
    return { canvas, context };
  }

  function board(view = { x: 0, y: 0, scale: 1 }): BoardState {
    return { ...createBoard(scene), view };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives the canvas two pixels for each CSS pixel on a screen with ratio 2", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas, context } = createCanvas();

    paint(canvas, board());

    expect(canvas.width).toBe(1440);
    expect(canvas.height).toBe(840);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, -0, -0);
  });

  it("rounds the size for a ratio that is not a whole number", () => {
    vi.stubGlobal("devicePixelRatio", 1.33);
    const { canvas } = createCanvas();

    paint(canvas, board());

    expect(canvas.width).toBe(958);
    expect(canvas.height).toBe(559);
  });

  it("puts the view and the ratio into one transform", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas, context } = createCanvas();

    paint(canvas, board({ x: 100, y: 50, scale: 0.5 }));

    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, -100, -50);
  });

  it("clears the part of the board that is in view, and then draws the shapes", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { canvas, context } = createCanvas();

    paint(canvas, board({ x: 10, y: 20, scale: 2 }));

    expect(context.clearRect).toHaveBeenCalledWith(10, 20, 360, 210);
    expect(context.strokeRect).toHaveBeenCalledTimes(2);
    expect(context.clearRect.mock.invocationCallOrder[0]).toBeLessThan(
      context.strokeRect.mock.invocationCallOrder[0],
    );
  });

  it("keeps lines 2 pixels wide on the screen at every zoom level", () => {
    const { canvas, context } = createCanvas();

    paint(canvas, board({ x: 0, y: 0, scale: 4 }));
    expect(context.lineWidth).toBe(0.5);

    paint(canvas, board({ x: 0, y: 0, scale: 0.5 }));
    expect(context.lineWidth).toBe(4);
  });

  it("draws nothing when the view is far from every shape", () => {
    const { canvas, context } = createCanvas();

    paint(canvas, board({ x: 50_000, y: 50_000, scale: 1 }));

    expect(context.strokeRect).not.toHaveBeenCalled();
  });

  it("draws the shape of a drag that is not finished, which is not in the saved scene", () => {
    const { canvas, context } = createCanvas();
    const drawing = [
      { type: "tool", tool: "rect" } as const,
      { type: "down", point: { x: 300, y: 300 } } as const,
      { type: "drag", point: { x: 340, y: 330 } } as const,
    ].reduce(boardReducer, board());

    paint(canvas, drawing);

    expect(context.strokeRect).toHaveBeenLastCalledWith(300, 300, 40, 30);
  });

  it("sets the size of the canvas only when it changed, because that is slow", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { canvas } = createCanvas();
    const setWidth = vi.spyOn(canvas, "width", "set");

    paint(canvas, board());
    paint(canvas, board());
    paint(canvas, board());

    expect(setWidth).toHaveBeenCalledTimes(1);
  });

  it("follows a ratio that changes, for example when the user zooms the page", () => {
    const { canvas } = createCanvas();
    vi.stubGlobal("devicePixelRatio", 1);
    paint(canvas, board());
    expect(canvas.width).toBe(720);

    vi.stubGlobal("devicePixelRatio", 1.5);
    paint(canvas, board());

    expect(canvas.width).toBe(1080);
  });

  it("does nothing more when the browser gives no 2D context", () => {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "getContext", { value: () => null });

    expect(() => paint(canvas, board())).not.toThrow();
  });
});
