/*
 * NOT PART OF THE INTERVIEW: production version.
 * The clock and the frames of the browser are fake, so the test can stop in
 * the middle of a move.
 */
import { renderHook } from "@testing-library/react";
import { wait } from "../testUtils";
import type { Position } from "./types";
import { MOVE_MS, useSmoothPosition } from "./useSmoothPosition";

const A: Position = { lat: 10, lng: 20 };
const B: Position = { lat: 11, lng: 22 };
const C: Position = { lat: 10, lng: 20 };

function setReducedMotion(wantsLess: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wantsLess && query === "(prefers-reduced-motion: reduce)",
  }));
}

function renderPosition(first: Position | null) {
  return renderHook(({ target }) => useSmoothPosition(target), {
    initialProps: { target: first },
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
      "Date",
    ],
  });
  setReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSmoothPosition", () => {
  it("shows the first position at once", () => {
    const { result } = renderPosition(A);

    expect(result.current).toEqual(A);
  });

  it("has no position while there is no courier", () => {
    const { result } = renderPosition(null);

    expect(result.current).toBeNull();
  });

  it("jumps to the first position when the courier appears", async () => {
    const { result, rerender } = renderPosition(null);

    rerender({ target: A });
    await wait(0);

    expect(result.current).toEqual(A);
  });

  it("moves to a new position step by step, and ends exactly on it", async () => {
    const { result, rerender } = renderPosition(A);

    rerender({ target: B });
    await wait(MOVE_MS / 2);
    const halfWay = result.current as Position;
    expect(halfWay.lat).toBeGreaterThan(10.3);
    expect(halfWay.lat).toBeLessThan(10.7);
    expect(halfWay.lng).toBeGreaterThan(20.6);
    expect(halfWay.lng).toBeLessThan(21.4);

    await wait(MOVE_MS);
    expect(result.current).toEqual(B);
  });

  it("starts from where the marker is when a new position arrives during a move", async () => {
    const { result, rerender } = renderPosition(A);
    rerender({ target: B });
    await wait(MOVE_MS / 2);
    const halfWay = result.current as Position;

    // The courier turns round. The marker must not jump to B first.
    rerender({ target: C });
    await wait(32);
    const justAfter = result.current as Position;

    expect(Math.abs(justAfter.lat - halfWay.lat)).toBeLessThan(0.05);
    await wait(MOVE_MS);
    expect(result.current).toEqual(C);
  });

  it("does not start again for a new object with the same place", async () => {
    const { result, rerender } = renderPosition(A);
    rerender({ target: B });
    await wait(MOVE_MS / 2);
    const halfWay = result.current as Position;

    rerender({ target: { ...B } });
    await wait(MOVE_MS / 2 + 32);

    expect(halfWay.lat).toBeLessThan(11);
    expect(result.current).toEqual(B);
  });

  it("jumps to the new position when the user asked for less motion", async () => {
    setReducedMotion(true);
    const { result, rerender } = renderPosition(A);

    rerender({ target: B });
    await wait(0);

    expect(result.current).toEqual(B);
  });

  it("stops asking for frames when it is removed", async () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const { rerender, unmount } = renderPosition(A);
    rerender({ target: B });
    await wait(MOVE_MS / 2);

    unmount();

    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the position when the courier goes away", async () => {
    const { result, rerender } = renderPosition(A);

    rerender({ target: null });
    await wait(0);

    expect(result.current).toBeNull();
  });
});
