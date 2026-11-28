/*
 * NOT PART OF THE INTERVIEW.
 * jsdom has no real canvas. drawScene only needs the few calls in `Surface`,
 * so these tests pass an object that writes every call down.
 */
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
    lineWidth: 0,
    strokeRect(x, y, width, height) {
      calls.push(`rect ${x},${y} ${width}x${height} ${this.strokeStyle} ${this.lineWidth}`);
    },
  };
  return { calls, surface };
}

describe("drawScene", () => {
  it("draws every shape, in the drawing order", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, null);

    expect(calls).toEqual(["rect 50,60 70x80 #1c1f23 2", "rect 10,20 30x40 #1c1f23 2"]);
  });

  it("draws a box 4 pixels around the selected shape, last, in another colour", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, "b");

    expect(calls).toHaveLength(3);
    expect(calls[2]).toBe("rect 46,56 78x88 #1a56db 2");
  });

  it("draws no selection box when the selected shape is not in the scene", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, scene, "gone");

    expect(calls).toHaveLength(2);
  });

  it("draws nothing for an empty scene", () => {
    const { calls, surface } = createRecorder();

    drawScene(surface, { shapesById: {}, order: [] }, null);

    expect(calls).toEqual([]);
  });
});

describe("paint", () => {
  function createCanvas(cssWidth: number, cssHeight: number) {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "clientWidth", { value: cssWidth });
    Object.defineProperty(canvas, "clientHeight", { value: cssHeight });
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
    };
    const getContext = vi.fn(() => context);
    Object.defineProperty(canvas, "getContext", { value: getContext });
    return { canvas, context, getContext };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives the canvas two pixels for each CSS pixel on a screen with ratio 2", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas, context } = createCanvas(300, 200);

    paint(canvas, scene, null);

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("rounds the size for a ratio that is not a whole number", () => {
    vi.stubGlobal("devicePixelRatio", 1.25);
    const { canvas } = createCanvas(301, 200);

    paint(canvas, scene, null);

    expect(canvas.width).toBe(376);
    expect(canvas.height).toBe(250);
  });

  it("clears the canvas in CSS pixels and then draws the shapes", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas, context } = createCanvas(300, 200);

    paint(canvas, scene, null);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 300, 200);
    expect(context.strokeRect).toHaveBeenCalledTimes(2);
    expect(context.clearRect.mock.invocationCallOrder[0]).toBeLessThan(
      context.strokeRect.mock.invocationCallOrder[0],
    );
  });

  it("sets the size of the canvas only when it changed, because that is slow", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { canvas } = createCanvas(300, 200);
    const setWidth = vi.spyOn(canvas, "width", "set");

    paint(canvas, scene, null);
    paint(canvas, scene, null);
    paint(canvas, scene, null);

    expect(setWidth).toHaveBeenCalledTimes(1);
  });

  it("follows a ratio that changes, for example when the user zooms the page", () => {
    const { canvas } = createCanvas(300, 200);
    vi.stubGlobal("devicePixelRatio", 1);
    paint(canvas, scene, null);
    expect(canvas.width).toBe(300);

    vi.stubGlobal("devicePixelRatio", 1.5);
    paint(canvas, scene, null);

    expect(canvas.width).toBe(450);
  });

  it("does nothing more when the browser gives no 2D context", () => {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "getContext", { value: () => null });

    expect(() => paint(canvas, scene, null)).not.toThrow();
  });
});
