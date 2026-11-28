/* NOT PART OF THE INTERVIEW: production version. It only makes imports shorter. */
export { Player } from "./Player";
export type { PlayerProps, Preload } from "./Player";
export { usePlayer } from "./usePlayer";
export type { PlayerActions, UsePlayerOptions } from "./usePlayer";
export { createPlayerStore, usePlayerValue } from "./store";
export type { PlayerStore } from "./store";
export {
  reducePlayer,
  backoffMs,
  INITIAL_STATE,
  MAX_AUTO_RETRIES,
  TRANSITIONS,
} from "./playerMachine";
export type { ErrorKind, PlayerEvent, PlayerState, PlayerStatus } from "./playerMachine";
export { createNativeEngine, errorKindOfCode } from "./engine";
export type { EngineEvent, StreamingEngine } from "./engine";
export { chooseQuality } from "./chooseQuality";
export type { QualityLevel } from "./chooseQuality";
export { DEFAULT_MESSAGES } from "./messages";
export type { PlayerMessages } from "./messages";
export type { PlayerMetricEvent } from "./metrics";
