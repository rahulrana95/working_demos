/* NOT PART OF THE INTERVIEW: production version. */
import {
  PENDING_ORDER_MAX_AGE_MS,
  clearPendingOrder,
  readPendingOrder,
  savePendingOrder,
} from "./pendingOrder";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the pending order", () => {
  it("is nothing before an order was placed", () => {
    expect(readPendingOrder()).toBeNull();
  });

  it("is found again after it was saved", () => {
    savePendingOrder("1001");

    expect(readPendingOrder()).toBe("1001");
  });

  it("is saved in localStorage, so a new tab of an in-app browser finds it too", () => {
    savePendingOrder("1001");

    expect(localStorage.getItem("pending-order")).toContain("1001");
    expect(sessionStorage.getItem("pending-order")).toBeNull();
  });

  it("is forgotten after it was cleared", () => {
    savePendingOrder("1001");

    clearPendingOrder();

    expect(readPendingOrder()).toBeNull();
  });

  it("is forgotten when it is a day old", () => {
    savePendingOrder("1001");

    vi.advanceTimersByTime(PENDING_ORDER_MAX_AGE_MS - 1);
    expect(readPendingOrder()).toBe("1001");

    vi.advanceTimersByTime(1);
    expect(readPendingOrder()).toBeNull();
  });

  it("ignores a saved value that is broken or has the wrong shape", () => {
    localStorage.setItem("pending-order", "{broken");
    expect(readPendingOrder()).toBeNull();

    localStorage.setItem("pending-order", JSON.stringify({ orderId: 7, savedAt: Date.now() }));
    expect(readPendingOrder()).toBeNull();

    localStorage.setItem("pending-order", JSON.stringify("1001"));
    expect(readPendingOrder()).toBeNull();
  });

  it("does not throw when the browser refuses to read or write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => savePendingOrder("1001")).not.toThrow();
    expect(readPendingOrder()).toBeNull();
    expect(() => clearPendingOrder()).not.toThrow();
  });
});
