/*
 * NOT PART OF THE INTERVIEW: production version.
 * Finds web addresses in the text of a message. The text of a message is
 * written by another person, so it is never trusted and never used as HTML.
 */

export type TextPart = { text: string; href?: string };

/** Starts with http:// or https://, and runs to the next space, quote or angle bracket. */
const ADDRESS = /https?:\/\/[^\s<>"']+/gi;
/** Marks that end a sentence, not an address: "See https://example.com." */
const TRAILING = /[.,;:!?)\]}]+$/;

/**
 * Returns the address when it is safe to make it a link: it parses, it is
 * http or https, and it holds no user name. `https://bank.com@evil.example`
 * shows a name the user trusts and opens another site, so it stays text.
 */
export function safeHref(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    return isWeb && url.username === "" && url.password === "" ? url.href : null;
  } catch {
    return null;
  }
}

/** Splits a text into plain parts and link parts. Joined again, the parts give the same text. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let end = 0;

  for (const match of text.matchAll(ADDRESS)) {
    const start = match.index ?? 0;
    const address = match[0].replace(TRAILING, "");
    const href = safeHref(address);
    if (href !== null) {
      if (start > end) {
        parts.push({ text: text.slice(end, start) });
      }
      // The user reads the address as it was written. It is the same one the link opens.
      parts.push({ text: address, href });
      end = start + address.length;
    }
  }
  if (end < text.length || parts.length === 0) {
    parts.push({ text: text.slice(end) });
  }
  return parts;
}

/** An image address from the server is not trusted either. Only these three kinds are shown. */
export function safeImageUrl(url: string): string | null {
  try {
    return ["http:", "https:", "blob:"].includes(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}
