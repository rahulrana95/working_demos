/*
 * NOT PART OF THE INTERVIEW.
 * The data for the demo: the quality levels, the captions and the Hindi texts.
 */
import type { PlayerMessages, QualityLevel } from "../player";
import type { SimulatedCue } from "./simulatedMedia";

/** What a video pipeline could produce for one video. */
export const LEVELS: QualityLevel[] = [
  { height: 240, kbps: 400 },
  { height: 360, kbps: 800 },
  { height: 480, kbps: 1400 },
  { height: 720, kbps: 2800 },
  { height: 1080, kbps: 5000 },
];

export const CUES: SimulatedCue[] = [
  { start: 1, end: 4, text: "This video is simulated." },
  {
    start: 5,
    end: 9,
    text: "The captions sit above the controls,\nso the controls never cover them.",
  },
  { start: 10, end: 14, text: "Press Buffer for 3 seconds and watch the state." },
  { start: 20, end: 25, text: "Move the network speed and watch the quality." },
];

function vttTime(seconds: number): string {
  return `00:00:${String(seconds).padStart(2, "0")}.000`;
}

/** The same captions as a WebVTT file, the format a <track> element loads. */
export function toWebVtt(cues: SimulatedCue[]): string {
  const blocks = cues.map((cue) => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cue.text}`);
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

export const HINDI_MESSAGES: PlayerMessages = {
  play: "चलाएँ",
  pause: "रोकें",
  mute: "आवाज़ बंद",
  volume: "आवाज़",
  seek: "समय",
  position: (current, total) => `${total} में से ${current}`,
  captions: "कैप्शन",
  captionSize: "कैप्शन का आकार",
  speed: "गति",
  quality: "गुणवत्ता",
  autoQuality: (level) => `अपने आप (${level})`,
  fullscreen: "पूरी स्क्रीन",
  pictureInPicture: "छोटी खिड़की",
  errorNetwork: "कनेक्शन टूट गया। अपना नेटवर्क जाँचें।",
  errorDecode: "इस वीडियो में खराबी है, यह नहीं चल सकता।",
  errorUnsupported: "वीडियो लोड नहीं हो सका।",
  retry: "फिर कोशिश करें",
  retrying: (attempt, maxAttempts) =>
    `कनेक्शन टूट गया। फिर कोशिश हो रही है (${maxAttempts} में से ${attempt})…`,
  crashed: "प्लेयर रुक गया।",
  reload: "प्लेयर फिर लोड करें",
  help: "कीबोर्ड शॉर्टकट",
  close: "बंद करें",
  helpPlay: "चलाएँ या रोकें",
  helpSeek: "5 सेकंड पीछे या आगे",
  helpVolume: "आवाज़ कम या ज़्यादा",
  helpMute: "आवाज़ बंद",
  helpStartEnd: "शुरू या अंत पर जाएँ",
  helpCaptions: "कैप्शन चालू या बंद",
  helpFullscreen: "पूरी स्क्रीन",
  helpHelp: "यह मदद दिखाएँ",
};
