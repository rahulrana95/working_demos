/* NOT PART OF THE INTERVIEW. Tests of the helpers for the texts, and of the id of a message. */
import { newClientId } from "./clientId";
import { defaultMessages, fill, plural } from "./messages";

describe("fill", () => {
  it("puts the values in the places with their name", () => {
    expect(fill("{name} is typing…", { name: "Ravi" })).toBe("Ravi is typing…");
    expect(fill("Uploading, {percent}%", { percent: 40 })).toBe("Uploading, 40%");
  });

  it("leaves a place it has no value for as it is", () => {
    expect(fill("{name} and {other}", { name: "Ravi" })).toBe("Ravi and {other}");
  });

  it("does not read a value as a template: a name with braces stays as it is", () => {
    expect(fill("{name} is typing…", { name: "{percent}", percent: 5 })).toBe(
      "{percent} is typing…",
    );
  });
});

describe("plural", () => {
  it("picks the form of the language and writes the number in its digits", () => {
    expect(plural(defaultMessages.unread, 1, "en")).toBe("1 unread message");
    expect(plural(defaultMessages.unread, 2, "en")).toBe("2 unread messages");
    expect(plural(defaultMessages.unread, 1500, "en")).toBe("1,500 unread messages");
    expect(plural({ one: "{count} संदेश", other: "{count} संदेश" }, 3, "hi-IN-u-nu-deva")).toBe(
      "३ संदेश",
    );
  });

  it("falls back to the form `other` when a form is missing", () => {
    expect(plural({ other: "{count} messages" }, 1, "en")).toBe("1 messages");
    expect(plural({}, 1, "en")).toBe("");
  });
});

describe("newClientId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("makes a different id every time", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newClientId()));

    expect(ids.size).toBe(1000);
  });

  it("still makes an id on a page without `crypto.randomUUID`, which exists only on https", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(171) });

    expect(newClientId()).toBe("ab".repeat(16));
  });
});
