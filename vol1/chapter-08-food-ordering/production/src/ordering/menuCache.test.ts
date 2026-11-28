/* NOT PART OF THE INTERVIEW: production version. */
import { MENU } from "../testUtils";
import { clearMenuMemory, readCachedMenu, writeCachedMenu } from "./menuCache";

beforeEach(() => {
  sessionStorage.clear();
  clearMenuMemory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the menu cache", () => {
  it("has nothing for a restaurant it never saw", () => {
    expect(readCachedMenu("r1")).toBeNull();
  });

  it("gives back the same menu from memory", () => {
    writeCachedMenu("r1", MENU);

    expect(readCachedMenu("r1")).toBe(MENU);
  });

  it("finds the menu in sessionStorage after a reload emptied the memory", () => {
    writeCachedMenu("r1", MENU);
    clearMenuMemory();

    expect(readCachedMenu("r1")).toEqual(MENU);
  });

  it("keeps one menu for each restaurant", () => {
    writeCachedMenu("r1", MENU);

    expect(readCachedMenu("r2")).toBeNull();
  });

  it("ignores a saved value that is not a menu", () => {
    sessionStorage.setItem("menu:r1", "{broken");
    expect(readCachedMenu("r1")).toBeNull();

    sessionStorage.setItem("menu:r1", JSON.stringify([{ id: "c", name: "C" }, null]));
    expect(readCachedMenu("r1")).toBeNull();
  });

  it("still works from memory when the browser refuses to store", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });

    expect(() => writeCachedMenu("r1", MENU)).not.toThrow();
    expect(readCachedMenu("r1")).toBe(MENU);
  });
});
