/*
 * NOT PART OF THE INTERVIEW: production version.
 * The draft must never break the form, whatever is in storage and whatever
 * the browser does with it.
 */
import { clearDraft, loadDraft, saveDraft } from "./draft";
import type { FormSchema } from "./types";

const schema: FormSchema = { id: "onboarding", version: 2, fields: [] };
const KEY = "form-draft:onboarding";

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("draft", () => {
  it("gives back what was saved", () => {
    const draft = {
      values: { name: "Asha", agree: true, "kids.0.age": 3 },
      itemCounts: { kids: 1 },
    };

    saveDraft(schema, draft);

    expect(loadDraft(schema)).toEqual(draft);
  });

  it("keeps the draft under the id of the schema, with its version", () => {
    saveDraft(schema, { values: { name: "Asha" }, itemCounts: {} });

    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? "")).toEqual({
      version: 2,
      values: { name: "Asha" },
      itemCounts: {},
    });
  });

  it("returns null when nothing was saved", () => {
    expect(loadDraft(schema)).toBeNull();
  });

  it("throws away a draft that was saved for another version of the schema", () => {
    saveDraft({ ...schema, version: 1 }, { values: { name: "Asha" }, itemCounts: {} });

    expect(loadDraft(schema)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("treats a schema with no version as version 1", () => {
    const plain: FormSchema = { id: "onboarding", fields: [] };
    saveDraft(plain, { values: { name: "Asha" }, itemCounts: {} });

    expect(loadDraft(plain)).not.toBeNull();
    expect(loadDraft({ ...plain, version: 1 })).not.toBeNull();
    expect(loadDraft({ ...plain, version: 2 })).toBeNull();
  });

  it("does not mix the drafts of two forms", () => {
    saveDraft(schema, { values: { name: "Asha" }, itemCounts: {} });

    expect(loadDraft({ ...schema, id: "leave-request" })).toBeNull();
  });

  it("removes the draft", () => {
    saveDraft(schema, { values: { name: "Asha" }, itemCounts: {} });
    clearDraft(schema);

    expect(loadDraft(schema)).toBeNull();
  });

  it("throws away text in storage that is not JSON", () => {
    window.sessionStorage.setItem(KEY, "{not json");

    expect(loadDraft(schema)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("drops the parts of a stored draft that have the wrong shape", () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        values: { name: "Asha", bad: { nested: true }, list: [1], nothing: null },
        itemCounts: { kids: 2, minus: -1, half: 1.5, text: "3" },
      }),
    );

    expect(loadDraft(schema)).toEqual({ values: { name: "Asha" }, itemCounts: { kids: 2 } });
  });

  it("returns empty parts when the stored draft has none", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ version: 2, values: "x" }));

    expect(loadDraft(schema)).toEqual({ values: {}, itemCounts: {} });
  });

  it("does not throw when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(() => saveDraft(schema, { values: { name: "Asha" }, itemCounts: {} })).not.toThrow();
  });

  it("does not throw when reading or removing fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(loadDraft(schema)).toBeNull();
    expect(() => clearDraft(schema)).not.toThrow();
  });

  it("does not throw when the browser refuses to hand out the storage at all", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(loadDraft(schema)).toBeNull();
    expect(() => saveDraft(schema, { values: {}, itemCounts: {} })).not.toThrow();
    expect(() => clearDraft(schema)).not.toThrow();
  });
});
