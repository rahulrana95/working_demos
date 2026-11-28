/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the component with a real reducer behind it. jsdom has no canvas,
 * so the 2D context is an object that counts the calls. The real drawing is
 * checked in a real browser (see the README).
 */
/// <reference types="vite/client" />
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { Whiteboard } from "./Whiteboard";
import { boardReducer, createBoard } from "./board";
import type { BoardState } from "./board";
import { DEFAULT_MESSAGES } from "./messages";
import type { WhiteboardMessages } from "./messages";
import type { Scene } from "./scene";

let latestState: BoardState;
let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let context: {
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  lineWidth: number;
};

function Harness({ scene, messages }: { scene?: Scene; messages?: WhiteboardMessages }) {
  const [state, dispatch] = useReducer(boardReducer, scene, createBoard);
  latestState = state;
  return <Whiteboard state={state} dispatch={dispatch} messages={messages} />;
}

/** Runs the frames that are waiting, as the browser does before it paints. */
function runFrame() {
  const waiting = [...frameCallbacks.values()];
  frameCallbacks.clear();
  act(() => waiting.forEach((callback) => callback(0)));
}

function getCanvas(): HTMLCanvasElement {
  return screen.getByRole("application", { name: "Whiteboard" }) as HTMLCanvasElement;
}

/** Sends a pointer event with a position inside the canvas. */
function pointer(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  x: number,
  y: number,
  init = {},
) {
  const canvas = getCanvas();
  const event = createEvent[type](canvas, { pointerId: 1, isPrimary: true, button: 0, ...init });
  Object.defineProperty(event, "offsetX", { value: x });
  Object.defineProperty(event, "offsetY", { value: y });
  fireEvent(canvas, event);
}

function drawRect(fromX: number, fromY: number, toX: number, toY: number) {
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  pointer("pointerDown", fromX, fromY);
  pointer("pointerMove", toX, toY);
  pointer("pointerUp", toX, toY);
}

beforeEach(() => {
  frameCallbacks = new Map();
  nextFrameId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frameCallbacks.set(nextFrameId, callback);
    return nextFrameId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frameCallbacks.delete(id));
  context = { setTransform: vi.fn(), clearRect: vi.fn(), strokeRect: vi.fn(), lineWidth: 0 };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    // Only the calls that paint() makes are needed here.
    context as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("drawing with the pointer", () => {
  it("draws a rectangle with pointer down, move and up, as one undo step", () => {
    render(<Harness />);

    drawRect(10, 20, 110, 80);

    expect(latestState.doc.scene.shapesById["1"]).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 60,
    });
    expect(latestState.doc.undoStack).toHaveLength(1);
  });

  it("captures the pointer on pointer down, so a drag that leaves the canvas goes on", () => {
    render(<Harness />);
    const capture = vi.spyOn(getCanvas(), "setPointerCapture");

    pointer("pointerDown", 10, 10, { pointerId: 7 });

    expect(capture).toHaveBeenCalledWith(7);
  });

  it("moves a shape by dragging it, as one undo step for many moves", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    pointer("pointerDown", 30, 30);
    for (let step = 1; step <= 50; step++) {
      pointer("pointerMove", 30 + step * 2, 30 + step);
    }
    pointer("pointerUp", 130, 80);

    expect(latestState.doc.scene.shapesById["1"]).toMatchObject({ x: 110, y: 60 });
    expect(latestState.doc.undoStack).toHaveLength(2);
  });

  it("ignores a second finger and the right mouse button", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));

    pointer("pointerDown", 10, 10, { isPrimary: false });
    pointer("pointerDown", 10, 10, { button: 2 });

    expect(latestState.drag).toBeNull();

    pointer("pointerDown", 10, 10);
    pointer("pointerMove", 300, 300, { isPrimary: false, pointerId: 2 });
    pointer("pointerUp", 300, 300, { isPrimary: false, pointerId: 2 });

    expect(latestState.drag).toEqual({ start: { x: 10, y: 10 }, pending: null });
  });

  it("drops the drag when the browser cancels the pointer", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    pointer("pointerDown", 10, 10);
    pointer("pointerMove", 90, 90);

    fireEvent.pointerCancel(getCanvas());

    expect(latestState.drag).toBeNull();
    expect(latestState.doc.scene.order).toEqual([]);
  });
});

describe("redrawing", () => {
  it("redraws once for many pointer moves in one frame", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    runFrame();
    context.clearRect.mockClear();

    pointer("pointerDown", 30, 30);
    for (let step = 1; step <= 40; step++) {
      pointer("pointerMove", 30 + step, 30);
    }

    expect(context.clearRect).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(1);
    runFrame();
    expect(context.clearRect).toHaveBeenCalledTimes(1);
  });

  it("draws the shape at its place during the drag, in that one redraw", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    pointer("pointerDown", 30, 30);
    pointer("pointerMove", 50, 30);
    pointer("pointerMove", 130, 30);
    context.strokeRect.mockClear();

    runFrame();

    expect(context.strokeRect).toHaveBeenCalledWith(110, 10, 50, 50);
    expect(context.lineWidth).toBe(2);
  });

  it("does not ask for a frame when nothing on the board changed", () => {
    render(<Harness />);
    runFrame();

    pointer("pointerMove", 30, 30);
    fireEvent.keyDown(getCanvas(), { key: "a" });

    expect(frameCallbacks.size).toBe(0);
  });

  it("cancels the waiting frame when the board is removed", () => {
    const { unmount } = render(<Harness />);
    expect(frameCallbacks.size).toBe(1);

    unmount();

    expect(frameCallbacks.size).toBe(0);
  });
});

describe("toolbar", () => {
  it("marks the chosen tool with aria-pressed", () => {
    render(<Harness />);
    const select = screen.getByRole("button", { name: "Select" });
    const rectangle = screen.getByRole("button", { name: "Rectangle" });
    expect(select).toHaveAttribute("aria-pressed", "true");
    expect(rectangle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(rectangle);

    expect(select).toHaveAttribute("aria-pressed", "false");
    expect(rectangle).toHaveAttribute("aria-pressed", "true");
  });

  it("puts the tools in a named group", () => {
    render(<Harness />);

    expect(screen.getByRole("group", { name: "Tools" })).toContainElement(
      screen.getByRole("button", { name: "Undo" }),
    );
  });

  it("marks Undo and Redo as disabled when their stack is empty", () => {
    render(<Harness />);
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toHaveAttribute("aria-disabled", "true");
    expect(redo).toHaveAttribute("aria-disabled", "true");

    drawRect(10, 10, 60, 60);
    expect(undo).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(undo);
    expect(undo).toHaveAttribute("aria-disabled", "true");
    expect(redo).toHaveAttribute("aria-disabled", "false");
  });

  it("keeps the focus on Undo when the last step is undone", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    const undo = screen.getByRole("button", { name: "Undo" });
    undo.focus();

    fireEvent.click(undo);

    expect(undo).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(undo);
  });

  it("the Undo and Redo buttons do the same as the keys", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(latestState.doc.scene.order).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(latestState.doc.scene.order).toEqual(["1"]);
  });
});

describe("keyboard", () => {
  it("Ctrl+Z on the canvas undoes, and the page does not get the key", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);

    const wasNotCancelled = fireEvent.keyDown(getCanvas(), { key: "z", ctrlKey: true });

    expect(latestState.doc.scene.order).toEqual([]);
    expect(wasNotCancelled).toBe(false);
  });

  it("an arrow key moves the selected shape and does not scroll the page", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);

    const wasNotCancelled = fireEvent.keyDown(getCanvas(), { key: "ArrowRight" });

    expect(latestState.doc.scene.shapesById["1"].x).toBe(20);
    expect(wasNotCancelled).toBe(false);
  });

  it("shortcuts also work when a toolbar button has the focus", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);

    fireEvent.keyDown(screen.getByRole("button", { name: "Rectangle" }), {
      key: "z",
      metaKey: true,
    });

    expect(latestState.doc.scene.order).toEqual([]);
  });

  it("keyboard only: choose Rectangle, press Enter on the canvas, nudge, undo", () => {
    render(<Harness />);
    const rectangle = screen.getByRole("button", { name: "Rectangle" });
    rectangle.focus();
    fireEvent.click(rectangle);
    const canvas = getCanvas();
    canvas.focus();
    expect(document.activeElement).toBe(canvas);

    fireEvent.keyDown(canvas, { key: "Enter" });
    expect(latestState.doc.scene.order).toEqual(["1"]);

    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(latestState.doc.scene.shapesById["1"].y).toBe(50);

    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    expect(latestState.doc.scene.shapesById["1"].y).toBe(40);
  });

  it("Enter on a toolbar button presses the button and adds no shape", () => {
    render(<Harness />);
    const rectangle = screen.getByRole("button", { name: "Rectangle" });
    fireEvent.click(rectangle);

    const wasNotCancelled = fireEvent.keyDown(rectangle, { key: "Enter" });

    expect(latestState.doc.scene.order).toEqual([]);
    // The key is left alone, so the browser can press the button.
    expect(wasNotCancelled).toBe(true);
  });

  it("does not fire shortcuts while the user types in a text field inside the board", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    const board = getCanvas().parentElement as HTMLElement;
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    board.append(input, textarea);

    for (const field of [input, textarea]) {
      const wasNotCancelled = fireEvent.keyDown(field, { key: "Backspace" });
      fireEvent.keyDown(field, { key: "z", ctrlKey: true });
      fireEvent.keyDown(field, { key: "ArrowLeft" });
      expect(wasNotCancelled).toBe(true);
    }

    expect(latestState.doc.scene.shapesById["1"]).toMatchObject({ x: 10, y: 10 });
    expect(latestState.doc.undoStack).toHaveLength(1);
  });

  it("leaves a key that is not a shortcut to the browser", () => {
    render(<Harness />);

    expect(fireEvent.keyDown(getCanvas(), { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(getCanvas(), { key: "r", ctrlKey: true })).toBe(true);
  });

  it("Escape during a drag cancels it, and releasing the button adds nothing", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    pointer("pointerDown", 30, 30);
    pointer("pointerMove", 200, 200);

    fireEvent.keyDown(getCanvas(), { key: "Escape" });
    pointer("pointerMove", 220, 220);
    pointer("pointerUp", 220, 220);

    expect(latestState.doc.scene.shapesById["1"]).toMatchObject({ x: 10, y: 10 });
    expect(latestState.doc.undoStack).toHaveLength(1);
  });

  it("Ctrl+Z in the middle of a drag does nothing", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    pointer("pointerDown", 30, 30);
    pointer("pointerMove", 200, 200);

    fireEvent.keyDown(getCanvas(), { key: "z", ctrlKey: true });
    pointer("pointerUp", 200, 200);

    expect(latestState.doc.scene.shapesById["1"]).toMatchObject({ x: 180, y: 180 });
    expect(latestState.doc.undoStack).toHaveLength(2);
  });
});

describe("screen readers", () => {
  it("the canvas can take the focus and has a name", () => {
    render(<Harness />);

    expect(getCanvas()).toHaveAttribute("tabindex", "0");
  });

  it("announces an undo in a polite status line", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    pointer("pointerDown", 30, 30);
    pointer("pointerMove", 80, 80);
    pointer("pointerUp", 80, 80);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Done: move rectangle. Steps to undo: 2.");

    fireEvent.keyDown(getCanvas(), { key: "z", ctrlKey: true });

    expect(status).toHaveTextContent("Undid: move rectangle. Steps to undo: 1.");
  });

  it("says nothing while a drag is in progress", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));

    pointer("pointerDown", 10, 10);
    pointer("pointerMove", 50, 50);
    pointer("pointerMove", 90, 90);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

/** Sends a wheel event with a position inside the canvas. Returns false when it was cancelled. */
function wheel(init: WheelEventInit, x = 0, y = 0): boolean {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "offsetX", { value: x });
  Object.defineProperty(event, "offsetY", { value: y });
  let wasNotCancelled = true;
  act(() => {
    wasNotCancelled = getCanvas().dispatchEvent(event);
  });
  return wasNotCancelled;
}

describe("pan and zoom", () => {
  it("the wheel moves the view and does not scroll the page", () => {
    render(<Harness />);

    const wasNotCancelled = wheel({ deltaX: 30, deltaY: 120 });

    expect(latestState.view).toEqual({ x: 30, y: 120, scale: 1 });
    expect(wasNotCancelled).toBe(false);
  });

  it("Ctrl and the wheel zoom around the pointer and do not zoom the page", () => {
    render(<Harness />);

    const wasNotCancelled = wheel({ deltaY: -200, ctrlKey: true }, 100, 50);

    expect(latestState.view.scale).toBeCloseTo(Math.E);
    // The board position under the pointer is the same as before: 100, 50.
    expect(latestState.view.x + 100 / latestState.view.scale).toBeCloseTo(100);
    expect(latestState.view.y + 50 / latestState.view.scale).toBeCloseTo(50);
    expect(wasNotCancelled).toBe(false);
  });

  it("listens to the wheel in a way that allows it to cancel the event", () => {
    const addListener = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");

    render(<Harness />);

    expect(addListener).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
  });

  it("stops listening to the wheel when the board is removed", () => {
    const { unmount } = render(<Harness />);
    const canvas = getCanvas();
    const before = latestState;
    unmount();

    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true }));

    expect(latestState).toBe(before);
  });

  it("draws a rectangle at the right board position after a pan and a zoom", () => {
    render(<Harness />);
    wheel({ deltaX: 1000, deltaY: 500 });
    wheel({ deltaY: -200 * Math.log(2), ctrlKey: true });
    expect(latestState.view).toEqual({ x: 1000, y: 500, scale: expect.closeTo(2) });

    drawRect(20, 20, 120, 60);

    const shape = latestState.doc.scene.shapesById["1"];
    expect(shape.x).toBeCloseTo(1010);
    expect(shape.y).toBeCloseTo(510);
    expect(shape.width).toBeCloseTo(50);
    expect(shape.height).toBeCloseTo(20);
  });

  it("the wheel in the middle of a drag does nothing", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    pointer("pointerDown", 10, 10);
    pointer("pointerMove", 50, 50);

    wheel({ deltaY: 120 });

    expect(latestState.view).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("with nothing selected, an arrow key moves the view", () => {
    render(<Harness />);

    fireEvent.keyDown(getCanvas(), { key: "ArrowRight" });

    expect(latestState.view.x).toBe(10);
  });
});

describe("drawing a large board", () => {
  /** 10,000 squares of 20 by 20, in 100 rows of 100, 60 apart. */
  function largeScene(): Scene {
    const scene: Scene = { shapesById: {}, order: [] };
    for (let index = 0; index < 10_000; index++) {
      const id = String(index + 1);
      const x = (index % 100) * 60;
      const y = Math.floor(index / 100) * 60;
      scene.shapesById[id] = { id, kind: "rect", x, y, width: 20, height: 20 };
      scene.order.push(id);
    }
    return scene;
  }

  it("draws only the shapes near the view, not all 10,000", () => {
    render(<Harness scene={largeScene()} />);

    runFrame();

    // The canvas is 720 by 420. The cells it touches hold a few hundred shapes.
    expect(context.strokeRect.mock.calls.length).toBeGreaterThan(80);
    expect(context.strokeRect.mock.calls.length).toBeLessThan(400);
  });

  it("draws other shapes after the view moved", () => {
    render(<Harness scene={largeScene()} />);
    runFrame();
    context.strokeRect.mockClear();

    wheel({ deltaX: 3000, deltaY: 3000 });
    runFrame();

    const firstCall = context.strokeRect.mock.calls[0];
    expect(firstCall[0]).toBeGreaterThan(2700);
    expect(firstCall[1]).toBeGreaterThan(2700);
  });

  it("sets the transform of the canvas from the view and the device pixel ratio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    render(<Harness />);
    wheel({ deltaX: 100, deltaY: 50 });

    runFrame();

    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, -200, -100);
    expect(context.clearRect).toHaveBeenLastCalledWith(100, 50, 720, 420);
  });
});

describe("messages", () => {
  it("shows the texts it is given, for example in Hindi", () => {
    const hindi: WhiteboardMessages = {
      ...DEFAULT_MESSAGES,
      board: "व्हाइटबोर्ड",
      toolbar: "औज़ार",
      tools: { select: "चुनें", rect: "आयत" },
      undo: "पूर्ववत करें",
      redo: "फिर से करें",
      status: ({ how, steps }) => `${how} ${steps}`,
    };
    render(<Harness messages={hindi} />);

    expect(screen.getByRole("application", { name: "व्हाइटबोर्ड" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "औज़ार" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "आयत" }));
    fireEvent.keyDown(screen.getByRole("application"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "पूर्ववत करें" }));

    expect(screen.getByRole("status")).toHaveTextContent("undone 0");
    expect(screen.getByRole("button", { name: "फिर से करें" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("has no English text of its own in the component file", async () => {
    const source = (await import("./Whiteboard.tsx?raw")).default;
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    // A text in JSX would stand between ">" and "<" and start with a capital letter.
    expect(withoutComments).not.toMatch(/>\s*[A-Z][a-z]+[^<{]*</);
    expect(withoutComments).not.toMatch(/aria-label="/);
  });
});
