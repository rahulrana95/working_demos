/* NOT PART OF THE INTERVIEW: production version. */
import { defaultMessages, plural } from "./messages";

describe("plural", () => {
  it("picks the form for one and the form for many in English", () => {
    expect(plural(defaultMessages.moreLabel, 1, "en")).toBe("1 more event");
    expect(plural(defaultMessages.moreLabel, 3, "en")).toBe("3 more events");
    expect(plural(defaultMessages.moreLabel, 0, "en")).toBe("0 more events");
  });

  it("uses the plural rules of the language, not the rules of English", () => {
    const polish = {
      one: "{count} wydarzenie",
      few: "{count} wydarzenia",
      other: "{count} wydarzeń",
    };

    expect(plural(polish, 1, "pl")).toBe("1 wydarzenie");
    expect(plural(polish, 3, "pl")).toBe("3 wydarzenia");
    expect(plural(polish, 5, "pl")).toBe("5 wydarzeń");
    expect(plural(polish, 22, "pl")).toBe("22 wydarzenia");
  });

  it("falls back to 'other' when the form for a category is missing", () => {
    expect(plural({ other: "{count} events" }, 1, "en")).toBe("1 events");
  });

  it("writes the number in the digits of the locale", () => {
    expect(plural({ other: "{count}" }, 1234, "en-US")).toBe("1,234");
    expect(plural({ other: "{count}" }, 12, "ar-EG")).toBe("١٢");
  });
});
