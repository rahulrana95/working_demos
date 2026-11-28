/* NOT PART OF THE INTERVIEW. It only makes imports shorter. */
export { Player } from "./Player";
export type { PlayerProps } from "./Player";
export { usePlayer, usePlayerValue, createPlayerStore } from "./usePlayer";
export type { PlayerStore } from "./usePlayer";
export { reducePlayer, INITIAL_STATE, TRANSITIONS } from "./playerMachine";
export type { PlayerEvent, PlayerState, PlayerStatus } from "./playerMachine";
export { chooseQuality } from "./chooseQuality";
export type { QualityLevel } from "./chooseQuality";
export { DEFAULT_MESSAGES } from "./messages";
export type { PlayerMessages } from "./messages";
