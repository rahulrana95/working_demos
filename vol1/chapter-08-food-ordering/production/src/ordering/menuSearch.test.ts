/* NOT PART OF THE INTERVIEW: production version. */
import { BIRYANI, MENU, NAAN, TIKKA } from "../testUtils";
import { countItems, filterMenu } from "./menuSearch";

describe("filterMenu", () => {
  it("returns the same menu for an empty text or only spaces", () => {
    expect(filterMenu(MENU, "")).toBe(MENU);
    expect(filterMenu(MENU, "   ")).toBe(MENU);
  });

  it("keeps the dishes whose name holds the text, in any case", () => {
    const found = filterMenu(MENU, " NAAN ");

    expect(found).toEqual([{ id: "mains", name: "Main course", items: [NAAN] }]);
  });

  it("drops a category with no dish left", () => {
    expect(filterMenu(MENU, "tikka").map((category) => category.id)).toEqual(["starters"]);
  });

  it("keeps the same dish objects, so their rows are not drawn again", () => {
    expect(filterMenu(MENU, "tikka")[0].items[0]).toBe(TIKKA);
  });

  it("returns no category when nothing matches", () => {
    expect(filterMenu(MENU, "pizza")).toEqual([]);
  });

  it("finds “BIRYANI” for “biryani” also in a Turkish browser", () => {
    // In Turkish, toLocaleLowerCase turns "I" into "ı", and nothing would match.
    const turkish = vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (
      this: string,
    ) {
      return this.replace(/I/g, "ı").toLowerCase();
    });
    const menu = [{ id: "c", name: "C", items: [{ ...BIRYANI, name: "BIRYANI" }] }];

    expect(filterMenu(menu, "biryani")).toHaveLength(1);
    turkish.mockRestore();
  });
});

describe("countItems", () => {
  it("counts the dishes of all categories", () => {
    expect(countItems(MENU)).toBe(3);
    expect(countItems([])).toBe(0);
  });
});
