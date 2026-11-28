/*
 * NOT PART OF THE INTERVIEW: production version.
 * Captions come from a <track> element inside the <video>. The browser loads
 * the file and tells us which lines belong to the current time. We draw the
 * text ourselves, in an element above the controls. So the controls never
 * cover the captions, and their size is ours to set.
 */
import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * A caption file can mark up its text, for example <i>word</i> or
 * <v Speaker>. We show plain text, so the marks are taken out.
 */
export function plainCueText(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/**
 * Returns the caption text for the current time, or "" when there is none.
 * `src` is the address of the captions file, the same one the <track> gets.
 */
export function useCaptions(
  videoRef: RefObject<HTMLVideoElement>,
  src: string | undefined,
  isOn: boolean,
): string {
  const [text, setText] = useState("");

  useEffect(() => {
    const track = videoRef.current?.textTracks[0];
    if (track === undefined) {
      setText("");
      return;
    }

    // "hidden" means: load the file and send "cuechange", but draw nothing.
    // "disabled" means: do not even load the file.
    track.mode = isOn ? "hidden" : "disabled";
    const readCues = () => {
      const cues = Array.from(track.activeCues ?? []) as VTTCue[];
      setText(isOn ? cues.map((cue) => plainCueText(cue.text)).join("\n") : "");
    };

    readCues();
    track.addEventListener("cuechange", readCues);
    return () => track.removeEventListener("cuechange", readCues);
    // A new file gives new cues, so `src` is in the list.
  }, [videoRef, src, isOn]);

  return text;
}
