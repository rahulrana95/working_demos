/* NOT PART OF THE INTERVIEW. */
import { loadCart, saveCart } from "./cartStorage";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cart storage", () => {
  it("gives back the cart that was saved", () => {
    saveCart("r1", [{ itemId: "tikka", quantity: 2 }]);

    expect(loadCart("r1")).toEqual([{ itemId: "tikka", quantity: 2 }]);
  });

  it("keeps one cart for each restaurant", () => {
    saveCart("r1", [{ itemId: "tikka", quantity: 2 }]);
    saveCart("r2", [{ itemId: "dosa", quantity: 1 }]);

    expect(loadCart("r1")).toEqual([{ itemId: "tikka", quantity: 2 }]);
    expect(loadCart("r2")).toEqual([{ itemId: "dosa", quantity: 1 }]);
  });

  it("gives an empty cart when nothing was saved", () => {
    expect(loadCart("r1")).toEqual([]);
  });

  it("gives an empty cart when the saved text is not JSON", () => {
    sessionStorage.setItem("cart:r1", "{not json");

    expect(loadCart("r1")).toEqual([]);
  });

  it("gives an empty cart when the saved value is not a list", () => {
    sessionStorage.setItem("cart:r1", JSON.stringify({ itemId: "tikka", quantity: 1 }));

    expect(loadCart("r1")).toEqual([]);
  });

  it("drops saved lines that are not real cart lines", () => {
    const saved = [
      { itemId: "tikka", quantity: 2 },
      { itemId: "naan", quantity: 0 },
      { itemId: "roti", quantity: 500 },
      { itemId: "chai", quantity: 1.5 },
      { itemId: 7, quantity: 1 },
      { quantity: 1 },
      null,
      "tikka",
    ];
    sessionStorage.setItem("cart:r1", JSON.stringify(saved));

    expect(loadCart("r1")).toEqual([{ itemId: "tikka", quantity: 2 }]);
  });

  it("does not throw when the browser refuses to read or write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });

    expect(loadCart("r1")).toEqual([]);
    expect(() => saveCart("r1", [{ itemId: "tikka", quantity: 1 }])).not.toThrow();
  });
});
