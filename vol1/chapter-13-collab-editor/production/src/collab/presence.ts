/*
 * NOT PART OF THE INTERVIEW: production version.
 * A textarea cannot draw a second caret. So we draw the other carets in a
 * layer behind it that holds the same text. This function cuts the text
 * into the pieces of that layer.
 */
import type { PeerCaret } from "./engine";

export interface PresencePart {
  /** The carets to draw before the text of this part. */
  carets: PeerCaret[];
  text: string;
  /** True when the text is inside the selection of another person. */
  selected: boolean;
}

export function presenceParts(text: string, peers: PeerCaret[]): PresencePart[] {
  const cuts = [...new Set([0, ...peers.flatMap((peer) => [peer.start, peer.end])])];
  cuts.sort((a, b) => a - b);

  return cuts.map((from, index) => {
    const to = cuts[index + 1] ?? text.length;
    return {
      carets: peers.filter((peer) => peer.end === from),
      text: text.slice(from, to),
      selected: from < to && peers.some((peer) => peer.start <= from && to <= peer.end),
    };
  });
}
