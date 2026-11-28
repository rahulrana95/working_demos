/* NOT PART OF THE INTERVIEW. Tests of the link finder. Message text is not trusted. */
import { safeHref, safeImageUrl, splitLinks } from "./linkify";

const links = (text: string) => splitLinks(text).filter((part) => part.href !== undefined);
const joined = (text: string) =>
  splitLinks(text)
    .map((part) => part.text)
    .join("");

describe("splitLinks", () => {
  it("gives a text without an address back as one plain part", () => {
    expect(splitLinks("See you at five")).toEqual([{ text: "See you at five" }]);
    expect(splitLinks("")).toEqual([{ text: "" }]);
  });

  it("finds an http and an https address inside a text", () => {
    expect(splitLinks("Read https://example.com/a?b=1#c and http://example.org now")).toEqual([
      { text: "Read " },
      { text: "https://example.com/a?b=1#c", href: "https://example.com/a?b=1#c" },
      { text: " and " },
      { text: "http://example.org", href: "http://example.org/" },
      { text: " now" },
    ]);
  });

  it("leaves the mark that ends the sentence out of the link", () => {
    expect(links("Is it https://example.com/page?")[0].text).toBe("https://example.com/page");
    expect(links("(see https://example.com/page).")[0].text).toBe("https://example.com/page");
    expect(joined("(see https://example.com/page).")).toBe("(see https://example.com/page).");
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "www.example.com",
    "//example.com",
    "http://",
    "https://",
  ])("makes no link of %j", (text) => {
    expect(links(text)).toEqual([]);
    expect(joined(text)).toBe(text);
  });

  it("makes no link of an address that hides its real site behind a user name", () => {
    expect(links("https://bank.example@evil.example/login")).toEqual([]);
    expect(links("https://user:secret@example.com")).toEqual([]);
  });

  it("finds an address written in capitals", () => {
    expect(links("HTTPS://EXAMPLE.COM/Path")[0].href).toBe("https://example.com/Path");
  });

  it("stops the address at a quote or an angle bracket, so no markup rides along", () => {
    const parts = splitLinks('https://example.com/"><img src=x onerror=alert(1)>');

    expect(parts[0]).toEqual({ text: "https://example.com/", href: "https://example.com/" });
    expect(parts.slice(1).every((part) => part.href === undefined)).toBe(true);
  });

  it("always gives the whole text back, part by part", () => {
    const texts = [
      "https://a.example https://b.example",
      "x https://example.com, y",
      "नमस्ते https://example.com/पथ ठीक है",
      "no links here.",
    ];

    for (const text of texts) {
      expect(joined(text)).toBe(text);
    }
  });

  it("handles a text of 2,000 characters with 100 addresses", () => {
    const text = Array.from({ length: 100 }, (_, index) => `https://e.example/${index}`).join(" ");

    expect(links(text)).toHaveLength(100);
  });
});

describe("safeHref and safeImageUrl", () => {
  it("accepts only http and https for a link", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("not an address")).toBeNull();
  });

  it("accepts http, https and blob for an image, and nothing else", () => {
    expect(safeImageUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(safeImageUrl("blob:http://localhost/1234")).toBe("blob:http://localhost/1234");
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
    expect(safeImageUrl("")).toBeNull();
  });
});
