/* NOT PART OF THE INTERVIEW. Test setup. */
import "@testing-library/jest-dom/vitest";

/*
 * jsdom has no pointer events and no pointer capture. These two small
 * stand-ins let a test send a pointer event and see that capture was asked for.
 */
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

if (typeof window.PointerEvent === "undefined") {
  Object.defineProperty(window, "PointerEvent", { value: TestPointerEvent, writable: true });
}
if (typeof Element.prototype.setPointerCapture === "undefined") {
  Element.prototype.setPointerCapture = () => {};
}
