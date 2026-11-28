/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove that storage trouble never becomes an error.
 */
import { readStorage, writeStorage } from "./storage";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("storage", () => {
  it("reads back what it wrote", () => {
    writeStorage("key", "value");

    expect(readStorage("key")).toBe("value");
  });

  it("returns null for a key that was never written", () => {
    expect(readStorage("missing")).toBeNull();
  });

  it("removes the key when the value is null", () => {
    writeStorage("key", "value");
    writeStorage("key", null);

    expect(localStorage.getItem("key")).toBeNull();
  });

  it("returns null when reading throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readStorage("key")).toBeNull();
  });

  it("does not throw when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(() => writeStorage("key", "value")).not.toThrow();
  });

  it("does not throw where localStorage does not exist", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(readStorage("key")).toBeNull();
    expect(() => writeStorage("key", "value")).not.toThrow();
    expect(() => writeStorage("key", null)).not.toThrow();
  });
});
