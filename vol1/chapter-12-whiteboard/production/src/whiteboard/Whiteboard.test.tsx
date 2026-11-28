/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the component with the real hook behind it. jsdom has no canvas,
 * so the 2D context is an object that counts the calls. The real drawing is
 * checked in a real browser (see the README).
 */
/// <reference types="vite/client" />
import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { LIST_LIMIT, Whiteboard } from "./Whiteboard";
import * as exportModule from "./exportPng";
import type { WhiteboardMessages } from "./messages";
import type { Presence } from "./presence";
import type { Scene } from "./scene";
import type { Operation } from "./sync";
import { useWhiteboard } from "./useWhiteboard";
import type { UseWhiteboardReturn } from "./useWhiteboard";

let board: UseWhiteboardReturn;
let sent: Operation[];
let presences: Presence[];
let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let context: Record<string, ReturnType<typeof vi.fn> | string | number>;

const transport = {
  send: (operation: Operation) => void sent.push(operation),
  sendPresence: (presence: Presence) => void presences.push(presence),
};

function Harness({ scene, messages }: { scene?: Scene; messages?: Partial<WhiteboardMessages> }) {
  board = useWhiteboard({
    userId: "a",
    userName: "Asha",
    userColour: "orange",
    transport,
    isOnline: true,
    initialScene: scene,
  });
  return <Whiteboard board={board} messages={messages} />;
}

function runFrame() {
  const waiting = [...frameCallbacks.values()];
  frameCallbacks.clear();
  act(() => waiting.forEach((callback) => callback(0)));
}

function getCanvas(): HTMLCanvasElement {
  return screen.getByRole("application", { name: "Whiteboard" }) as HTMLCanvasElement;
}

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

function shapeButtons(): HTMLElement[] {
  return within(getCanvas()).queryAllByRole("button");
}

function sceneOfRects(count: number): Scene {
  const scene: Scene = { shapesById: {}, order: [] };
  for (let index = 0; index < count; index++) {
    const id = `s-${index + 1}`;
    scene.shapesById[id] = {
      id,
      kind: "rect",
      x: (index % 100) * 6,
      y: Math.floor(index / 100) * 6,
      width: 4,
      height: 4,
      stroke: "#000",
    };
    scene.order.push(id);
  }
  return scene;
}

beforeEach(() => {
  sent = [];
  presences = [];
  frameCallbacks = new Map();
  nextFrameId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frameCallbacks.set(nextFrameId, callback);
    return nextFrameId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frameCallbacks.delete(id));
  context = {};
  for (const name of [
    "setTransform",
    "clearRect",
    "strokeRect",
    "beginPath",
    "lineTo",
    "arc",
    "stroke",
    "fill",
    "fillText",
    "setLineDash",
  ]) {
    context[name] = vi.fn();
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    // Only the calls that paint() makes are needed here.
    context as unknown as CanvasRenderingContext2D,
  );
  // jsdom has no layout: every element is 0 by 0. The tests need a canvas with a size.
  vi.spyOn(HTMLCanvasElement.prototype, "clientWidth", "get").mockReturnValue(720);
  vi.spyOn(HTMLCanvasElement.prototype, "clientHeight", "get").mockReturnValue(420);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("drawing", () => {
  it("draws a rectangle with the pointer, as one operation", () => {
    render(<Harness />);

    drawRect(10, 20, 110, 80);

    expect(board.state.sync.scene.shapesById["a-1"]).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 60,
    });
    expect(sent).toHaveLength(1);
  });

  it("reports the size of the canvas to the board", () => {
    render(<Harness />);

    expect(board.state.size).toEqual({ width: 720, height: 420 });
  });

  it("follows the canvas when its size changes", () => {
    let resized: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(<Harness />);

    vi.spyOn(HTMLCanvasElement.prototype, "clientWidth", "get").mockReturnValue(1000);
    act(() => resized?.());

    expect(board.state.size).toEqual({ width: 1000, height: 420 });
  });

  it("redraws once for many pointer moves in one frame, and reports the frame", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    runFrame();
    (context.clearRect as ReturnType<typeof vi.fn>).mockClear();

    pointer("pointerDown", 30, 30);
    for (let step = 1; step <= 40; step++) {
      pointer("pointerMove", 30 + step, 30);
    }

    expect(frameCallbacks.size).toBe(1);
    runFrame();
    expect(context.clearRect).toHaveBeenCalledTimes(1);
  });

  it("draws a freehand line with the Freehand tool", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Freehand" }));

    pointer("pointerDown", 10, 10);
    pointer("pointerMove", 60, 10);
    pointer("pointerMove", 60, 90);
    pointer("pointerUp", 60, 90);

    expect(board.state.sync.scene.shapesById["a-1"]).toMatchObject({
      kind: "path",
      width: 50,
      height: 80,
    });
  });

  it("sends the pointer position to the others while it moves, and null when it leaves", () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => vi.advanceTimersByTime(100));
    presences.length = 0;

    pointer("pointerMove", 44, 55);
    expect(presences[0].cursor).toEqual({ x: 44, y: 55 });

    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerLeave(getCanvas());
    expect(presences[presences.length - 1].cursor).toBeNull();
    vi.useRealTimers();
  });

  it("the wheel moves the view, and Ctrl with the wheel zooms around the pointer", () => {
    render(<Harness />);
    const wheel = (init: WheelEventInit) => {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
      Object.defineProperty(event, "offsetX", { value: 100 });
      Object.defineProperty(event, "offsetY", { value: 50 });
      let wasNotCancelled = true;
      act(() => {
        wasNotCancelled = getCanvas().dispatchEvent(event);
      });
      return wasNotCancelled;
    };

    expect(wheel({ deltaX: 30, deltaY: 120 })).toBe(false);
    expect(board.state.view).toEqual({ x: 30, y: 120, scale: 1 });

    expect(wheel({ deltaY: -200 * Math.log(2), ctrlKey: true })).toBe(false);
    expect(board.state.view.scale).toBeCloseTo(2);
    expect(board.state.view.x + 100 / 2).toBeCloseTo(130);
  });

  it("counts a wheel that reports lines as 16 pixels a line", () => {
    render(<Harness />);
    const event = new WheelEvent("wheel", { cancelable: true, deltaY: 3, deltaMode: 1 });

    act(() => void getCanvas().dispatchEvent(event));

    expect(board.state.view.y).toBe(48);
  });
});

describe("toolbar", () => {
  it("marks the chosen tool and the chosen colour with aria-pressed", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    fireEvent.click(screen.getByRole("button", { name: "Red" }));

    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Black" })).toHaveAttribute("aria-pressed", "false");
  });

  it("names every colour in words, so it is not known by its swatch alone", () => {
    render(<Harness />);

    const colours = within(screen.getByRole("group", { name: "Colour" })).getAllByRole("button");

    expect(colours.map((button) => button.textContent)).toEqual(["Black", "Red", "Blue"]);
  });

  it("a colour button colours the selected shape", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);

    fireEvent.click(screen.getByRole("button", { name: "Blue" }));

    expect(board.state.sync.scene.shapesById["a-1"].stroke).toBe("#1a56db");
  });

  it("marks Undo and Redo as disabled when their stack is empty, and keeps the focus on them", () => {
    render(<Harness />);
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveAttribute("aria-disabled", "true");
    drawRect(10, 10, 60, 60);
    undo.focus();

    fireEvent.click(undo);

    expect(undo).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Redo" })).toHaveAttribute("aria-disabled", "false");
    expect(document.activeElement).toBe(undo);
  });

  it("the picture button saves the canvas", () => {
    const exportPng = vi.spyOn(exportModule, "exportPng").mockResolvedValue(true);
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Save as picture" }));

    expect(exportPng).toHaveBeenCalledWith(getCanvas());
  });
});

describe("the shape list for screen readers", () => {
  it("has one button inside the canvas for each shape in view, with its kind and place", () => {
    render(<Harness />);
    drawRect(10, 20, 110, 80);
    fireEvent.click(screen.getByRole("button", { name: "Freehand" }));
    pointer("pointerDown", 200, 100);
    pointer("pointerMove", 260, 140);
    pointer("pointerUp", 260, 140);

    expect(shapeButtons().map((button) => button.textContent)).toEqual([
      "Rectangle 1 at 10, 20",
      "Freehand line 2 at 200, 100",
    ]);
  });

  it("selects a shape when its button gets the focus, and marks it as pressed", () => {
    render(<Harness scene={sceneOfRects(3)} />);
    const [first, second] = shapeButtons();

    act(() => second.focus());

    expect(board.state.selectedId).toBe("s-2");
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
  });

  it("arrow keys on a shape button move that shape, and the button keeps the focus", () => {
    render(<Harness scene={sceneOfRects(3)} />);
    const second = shapeButtons()[1];
    act(() => second.focus());

    fireEvent.keyDown(second, { key: "ArrowRight" });

    expect(board.state.sync.scene.shapesById["s-2"].x).toBe(16);
    expect(document.activeElement).toBe(shapeButtons()[1]);
    expect(shapeButtons()[1]).toHaveTextContent("Rectangle 2 at 16, 0");
  });

  it("Delete on a shape button removes the shape and moves the focus to the canvas", () => {
    render(<Harness scene={sceneOfRects(3)} />);
    const second = shapeButtons()[1];
    act(() => second.focus());

    fireEvent.keyDown(second, { key: "Delete" });

    expect(board.state.sync.scene.order).toEqual(["s-1", "s-3"]);
    expect(document.activeElement).toBe(getCanvas());
  });

  it("Enter on a shape button adds no rectangle", () => {
    render(<Harness scene={sceneOfRects(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));

    fireEvent.keyDown(shapeButtons()[0], { key: "Enter" });

    expect(board.state.sync.scene.order).toHaveLength(3);
  });

  it("holds at most 50 buttons for a board of 10,000 shapes, and says how many more are in view", () => {
    expect(LIST_LIMIT).toBe(50);
    render(<Harness scene={sceneOfRects(10_000)} />);

    expect(shapeButtons()).toHaveLength(50);
    const inView = board.state.sync.scene.order.length;
    expect(inView).toBe(10_000);
    expect(within(getCanvas()).getByText(/more shapes are in view/)).toBeInTheDocument();
  });

  it("keeps the selected shape in the list when it is not among the listed ones", () => {
    render(<Harness scene={sceneOfRects(10_000)} />);

    act(() => board.dispatch({ type: "select", id: "s-1" }));

    const buttons = shapeButtons();
    expect(buttons).toHaveLength(51);
    expect(buttons[50]).toHaveAttribute("aria-pressed", "true");
  });

  it("does not list a shape that is still being drawn", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));

    pointer("pointerDown", 10, 10);
    pointer("pointerMove", 80, 80);

    expect(shapeButtons()).toEqual([]);
  });
});

describe("keyboard", () => {
  it("keyboard only: choose Rectangle, Enter on the canvas, arrows, undo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    const canvas = getCanvas();
    canvas.focus();

    fireEvent.keyDown(canvas, { key: "Enter" });
    expect(board.state.sync.scene.shapesById["a-1"]).toMatchObject({ x: 300, y: 170 });

    fireEvent.keyDown(canvas, { key: "ArrowRight", timeStamp: 1000 });
    expect(board.state.sync.scene.shapesById["a-1"].x).toBe(310);

    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    expect(board.state.sync.scene.shapesById["a-1"].x).toBe(300);
  });

  it("Enter on a toolbar button presses the button and adds no shape", () => {
    render(<Harness />);
    const rectangle = screen.getByRole("button", { name: "Rectangle" });
    fireEvent.click(rectangle);

    expect(fireEvent.keyDown(rectangle, { key: "Enter" })).toBe(true);
    expect(board.state.sync.scene.order).toEqual([]);
  });

  it("does not fire shortcuts while the user types in a field inside the board", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    const input = document.createElement("input");
    getCanvas().parentElement?.append(input);

    expect(fireEvent.keyDown(input, { key: "Backspace" })).toBe(true);
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });

    expect(board.state.sync.scene.order).toEqual(["a-1"]);
  });

  it("Ctrl+Z on a toolbar button undoes and leaves the focus on that button", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    const select = screen.getByRole("button", { name: "Select" });
    select.focus();

    fireEvent.keyDown(select, { key: "z", ctrlKey: true });

    expect(board.state.sync.scene.order).toEqual([]);
    expect(document.activeElement).toBe(select);
  });
});

describe("status line and messages", () => {
  it("announces what was done and undone, with the kind of shape", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Done: add rectangle. Steps to undo: 1.");

    fireEvent.keyDown(getCanvas(), { key: "ArrowRight" });
    fireEvent.keyDown(getCanvas(), { key: "z", ctrlKey: true });

    expect(status).toHaveTextContent("Undid: move rectangle. Steps to undo: 1.");
  });

  it("tells the user when an undo had nothing left to do", () => {
    render(<Harness />);
    drawRect(10, 10, 60, 60);
    act(() => {
      board.receiveOperation(1, sent[0]);
      board.receiveOperation(2, { id: "b-1", userId: "b", command: { type: "remove", id: "a-1" } });
    });

    fireEvent.keyDown(getCanvas(), { key: "z", ctrlKey: true });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Nothing to do for add rectangle: someone else changed or removed it. Steps to undo: 0.",
    );
  });

  it("shows the texts it is given, for example in Hindi", () => {
    render(
      <Harness
        scene={sceneOfRects(1)}
        messages={{
          board: "व्हाइटबोर्ड",
          undo: "पूर्ववत करें",
          tools: { select: "चुनें", rect: "आयत", pen: "हाथ से", hand: "खिसकाएँ" },
          colourNames: ["काला", "लाल", "नीला"],
          shape: (shape, kind, number) => `${kind} ${number}: ${shape.x}`,
          kinds: { rect: "आयत", path: "रेखा" },
        }}
      />,
    );

    expect(screen.getByRole("application", { name: "व्हाइटबोर्ड" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "पूर्ववत करें" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "हाथ से" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "लाल" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "आयत 1: 0" })).toBeInTheDocument();
  });

  it("has no English text of its own in the component files", async () => {
    for (const file of ["./Whiteboard.tsx?raw", "./ErrorBoundary.tsx?raw"]) {
      const source = ((await import(/* @vite-ignore */ file)) as { default: string }).default;
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

      // A text in JSX would stand between ">" and "<" and start with a capital letter.
      expect(code).not.toMatch(/>\s*[A-Z][a-z]+[^<{]*</);
      expect(code).not.toMatch(/aria-label="/);
    }
  });
});

describe("other users", () => {
  it("draws the pointer and the name of another user", () => {
    render(<Harness scene={sceneOfRects(1)} />);
    act(() =>
      board.receivePresence({
        userId: "b",
        name: "Bela",
        colour: "purple",
        cursor: { x: 50, y: 60 },
        selectedId: "s-1",
      }),
    );

    runFrame();

    expect(context.arc).toHaveBeenCalledWith(50, 60, 5, 0, 2 * Math.PI);
    expect(context.fillText).toHaveBeenCalledWith("Bela", 58, 64);
  });
});
