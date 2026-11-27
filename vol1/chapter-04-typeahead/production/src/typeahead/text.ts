/*
 * NOT PART OF THE INTERVIEW: production version.
 * Two small helpers for the text the user types.
 */

/**
 * Cleans the typed text, so the same search always looks the same.
 *
 * "  New   Delhi " and "new delhi" become one cache key and one URL.
 * A CDN in front of the server can then answer both from one stored copy.
 */
export function normaliseQuery(text: string): string {
  return (
    text
      .trim()
      .replace(/\s+/g, " ")
      // One letter can be stored in two ways, for example "é" as one code or
      // as "e" plus an accent. NFC turns both into the same form.
      .normalize("NFC")
      // Not `toLocaleLowerCase`: that follows the language of the browser.
      // A Turkish browser turns "INDORE" into "ındore", with a dotless "ı".
      // That is a different cache key and a different URL for the same city.
      // `toLowerCase` gives "indore" in every browser.
      .toLowerCase()
  );
}

/**
 * Counts the characters as the user sees them.
 *
 * `"दि".length` is 2 and `"👍🏽".length` is 4, but the user sees one character
 * in each. `Intl.Segmenter` splits text the way a reader does.
 */
export function countGraphemes(text: string, locale?: string): number {
  if (typeof Intl.Segmenter !== "function") {
    // An old browser. This still counts a simple emoji as one character.
    return Array.from(text).length;
  }

  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text)).length;
}
