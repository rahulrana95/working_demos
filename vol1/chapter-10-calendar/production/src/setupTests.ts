/* NOT PART OF THE INTERVIEW: production version. Test setup. */
import "@testing-library/jest-dom/vitest";

// jsdom has no PointerEvent. The tests of dragging need one that carries the
// position and the button of the pointer, which a MouseEvent already does.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  Object.defineProperty(window, "PointerEvent", { value: PointerEventPolyfill, writable: true });
}

// Each test starts with an empty saved queue.
afterEach(() => {
  window.localStorage.clear();
});
