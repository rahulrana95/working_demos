/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the component with a real reducer behind it. jsdom has no canvas,
 * so the 2D context is an object that counts the calls. The real drawing is
 * checked in a real browser (see the README).
 */
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { Whiteboard } from "./Whiteboard";
import { boardReducer, createBoard } from "./board";
import type { BoardState } from "./board";

let latestState: BoardState;
let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let context: {
  setTransform: () => void;
  clearRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
};

function Harness() {
  const [state, dispatch] = useReducer(boardReducer, undefined, createBoard);
  latestState = state;
  return <Whiteboard label="Test board" state={state} dispatch={dispatch} />;
}

/** Runs the frames that are waiting, as the browser does before it paints. */
function runFrame() {
  const waiting = [...frameCallbacks.values()];
  frameCallbacks.clear();
  act(() => waiting.forEach((callback) => callback(0)));
}

function getCanvas(): HTMLCanvasElement {
  return screen.getByRole("application", { name: "Test board" }) as HTMLCanvasElement;
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
  context = { setTransform: () => {}, clearRect: vi.fn(), strokeRect: vi.fn() };
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
